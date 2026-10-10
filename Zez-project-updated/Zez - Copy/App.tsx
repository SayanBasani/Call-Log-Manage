import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Button,
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import CallLogs from 'react-native-call-log';
import {
  getCallStats,
  getDatabase,
  getPendingCalls,
  getSavedCalls,
  markCallsSynced,
  saveCalls,
  SavedCall,
  updateCallNote,
} from './src/database/callDatabase';

// Android emulator: 10.0.2.2 routes to the computer running the API.
// For a physical phone, replace this with your computer's LAN IP, e.g.
// http://192.168.1.20:3000. For production use HTTPS and authentication.
const API_BASE_URL = 'http://10.0.2.2:3000';
const CALL_LOG_LIMIT = 5000;

type Stats = {total: number; incoming: number; outgoing: number; missed: number; pending: number};
type Filter = 'ALL' | 'INCOMING' | 'OUTGOING' | 'MISSED';

export default function App() {
  const [calls, setCalls] = useState<SavedCall[]>([]);
  const [stats, setStats] = useState<Stats>({total: 0, incoming: 0, outgoing: 0, missed: 0, pending: 0});
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('Preparing Zez database...');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [recentOnly, setRecentOnly] = useState(false);
  const [serverCount, setServerCount] = useState<number | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const appState = useRef<string | null | undefined>(AppState.currentState);
  const importRunning = useRef(false);
  const syncRunning = useRef(false);
  const initialized = useRef(false);

  const refreshSavedCalls = useCallback(async () => {
    const [saved, currentStats] = await Promise.all([getSavedCalls(), getCallStats()]);
    setCalls(saved);
    setStats(currentStats);
    setNoteDrafts(previous => {
      const next = {...previous};
      saved.forEach(call => {
        if (next[call.id] === undefined) next[call.id] = call.note || '';
      });
      return next;
    });
  }, []);

  const fetchServerCount = useCallback(async () => {
    const response = await fetch(`${API_BASE_URL}/api/calls?limit=1`);
    if (!response.ok) throw new Error(`GET /api/calls failed (${response.status})`);
    const body = await response.json();
    setServerCount(Number(body?.pagination?.total ?? body?.data?.length ?? 0));
  }, []);

  const syncAPI = useCallback(async (manual = false) => {
    if (syncRunning.current) return;
    syncRunning.current = true;
    setSyncing(true);
    try {
      const pending = await getPendingCalls();
      if (pending.length) {
        const payload = {
          calls: pending.map(call => {
            let raw: Record<string, unknown> = {};
            try { raw = JSON.parse(call.rawJson) as Record<string, unknown>; } catch {}
            return {
              ...raw,
              id: call.fingerprint.replace(/^android:/, ''),
              phoneNumber: call.phoneNumber,
              name: call.name,
              type: call.type,
              timestamp: Number(call.timestamp) || call.timestamp,
              duration: call.duration,
              note: call.note || '',
            };
          }),
        };
        const response = await fetch(`${API_BASE_URL}/api/calls`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!response.ok || result?.success !== true) {
          throw new Error(result?.error || `POST /api/calls failed (${response.status})`);
        }
        await markCallsSynced(pending.map(call => call.id));
      }
      await fetchServerCount();
      await refreshSavedCalls();
      setMessage(`API sync complete. Uploaded/confirmed ${pending.length} pending record(s). Server total refreshed.`);
      if (manual) Alert.alert('Sync complete', `${pending.length} pending record(s) sent. Server count refreshed.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(`API sync failed; records remain pending for retry. ${detail}`);
      if (manual) Alert.alert('Sync failed', `${detail}\n\nCheck the API server and API_BASE_URL.`);
    } finally {
      syncRunning.current = false;
      setSyncing(false);
    }
  }, [fetchServerCount, refreshSavedCalls]);

  const importCallHistory = useCallback(async (automatic = false) => {
    if (Platform.OS !== 'android') {
      setMessage('Call history access requires Android.');
      return;
    }
    if (importRunning.current) return;
    importRunning.current = true;
    setLoading(true);
    try {
      await getDatabase();
      let permission: string = PermissionsAndroid.RESULTS.GRANTED;
      if (Platform.Version >= 23 && !(await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_CALL_LOG))) {
        permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_CALL_LOG, {
          title: 'Allow Zez to read call history',
          message: 'Zez needs access to import your call records.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        });
      }
      if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
        setMessage(`Call-log permission not granted: ${permission}`);
        await refreshSavedCalls();
        return;
      }
      setMessage(automatic ? 'Checking for new call records...' : 'Importing call history...');
      const records = await CallLogs.load(CALL_LOG_LIMIT);
      const imported = Array.isArray(records) ? records : [];
      const inserted = await saveCalls(imported);
      await refreshSavedCalls();
      setMessage(`Read ${imported.length} records; added ${inserted} new. Starting API sync...`);
      // Import still succeeds if the API is offline; the upload queue remains pending.
      void syncAPI(false);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error('Call-history import error:', error);
      setMessage(`Import failed: ${detail}`);
      try { await refreshSavedCalls(); } catch {}
    } finally {
      importRunning.current = false;
      setLoading(false);
    }
  }, [refreshSavedCalls, syncAPI]);

  useEffect(() => {
    const nativeModule = NativeModules.ZezCallLog;
    if (!nativeModule) return;
    const emitter = new NativeEventEmitter(nativeModule);
    const subscription = emitter.addListener('ZezCallLogChanged', () => {
      void importCallHistory(true);
    });
    void nativeModule.startObserving();
    return () => {
      subscription.remove();
      void nativeModule.stopObserving();
    };
  }, [importCallHistory]);

  useEffect(() => {
    let mounted = true;
    const initialize = async () => {
      try {
        await getDatabase();
        await refreshSavedCalls();
        if (!mounted) return;
        initialized.current = true;
        setMessage('Database ready. Checking call history and API...');
        await importCallHistory(true);
      } catch (error) {
        if (mounted) setMessage(`Database error: ${String(error)}`);
      }
    };
    void initialize();
    return () => { mounted = false; };
  }, [importCallHistory, refreshSavedCalls]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      const wasBackgrounded = appState.current != null && /inactive|background/.test(appState.current);
      appState.current = nextState;
      if (wasBackgrounded && nextState === 'active' && initialized.current) {
        void importCallHistory(true);
        void syncAPI(false);
      }
    });
    return () => subscription.remove();
  }, [importCallHistory, syncAPI]);

  const visibleCalls = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return calls.filter(call => {
      const type = (call.type || '').toUpperCase();
      const matchesType = filter === 'ALL' || type.includes(filter);
      const searchable = `${call.name} ${call.phoneNumber} ${call.note} ${call.type}`.toLowerCase();
      const matchesSearch = !needle || searchable.includes(needle);
      const date = Number(call.timestamp);
      const matchesDate = !recentOnly || (Number.isFinite(date) && date >= cutoff);
      return matchesType && matchesSearch && matchesDate;
    });
  }, [calls, search, filter, recentOnly]);

  const saveNote = useCallback(async (call: SavedCall) => {
    try {
      await updateCallNote(call.id, noteDrafts[call.id] ?? '');
      await refreshSavedCalls();
      setMessage('Note saved locally.');
    } catch (error) {
      Alert.alert('Could not save note', String(error));
    }
  }, [noteDrafts, refreshSavedCalls]);

  const exportCSV = useCallback(async () => {
    const escapeCSV = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const header = ['Name', 'Phone Number', 'Type', 'Timestamp', 'Duration Seconds', 'Note', 'Sync Status'];
    const rows = calls.map(call => [call.name, call.phoneNumber, call.type, call.timestamp, call.duration, call.note, call.syncStatus]);
    const csv = [header, ...rows].map(row => row.map(escapeCSV).join(',')).join('\n');
    try {
      await Share.share({title: 'Zez call history CSV', message: csv});
    } catch (error) {
      Alert.alert('Export failed', String(error));
    }
  }, [calls]);

  const checkAPI = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/health`);
      if (!response.ok) throw new Error(`Health check failed (${response.status})`);
      const data = await response.json();
      await fetchServerCount();
      setMessage(`API is ${data.status || 'healthy'} at ${API_BASE_URL}.`);
    } catch (error) {
      setMessage(`API unreachable at ${API_BASE_URL}. ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [fetchServerCount]);

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Zez</Text>
      <Text style={styles.subtitle}>Call History Manager</Text>
      <Text style={styles.message}>{message}</Text>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Overview</Text>
        <View style={styles.statsRow}>
          <Stat label="Total" value={stats.total} />
          <Stat label="Incoming" value={stats.incoming} />
          <Stat label="Outgoing" value={stats.outgoing} />
          <Stat label="Missed" value={stats.missed} />
        </View>
        <Text style={styles.small}>Pending uploads: {stats.pending}   •   Server records: {serverCount ?? 'not checked'}</Text>
      </View>

      <View style={styles.button}><Button title={loading ? 'Importing...' : 'Import / Refresh Call History'} disabled={loading} onPress={() => void importCallHistory(false)} /></View>
      <View style={styles.button}><Button title={syncing ? 'Syncing API...' : 'Sync API Now'} disabled={syncing} onPress={() => void syncAPI(true)} /></View>
      <View style={styles.button}><Button title="Check API Connection" onPress={() => void checkAPI()} /></View>
      <View style={styles.button}><Button title="Reload Saved Records" onPress={() => void refreshSavedCalls()} /></View>
      <View style={styles.button}><Button title="Export All Records (CSV)" onPress={() => void exportCSV()} /></View>

      {(loading || syncing) && <ActivityIndicator size="large" style={styles.spinner} />}

      <Text style={styles.sectionTitle}>Find call records</Text>
      <TextInput value={search} onChangeText={setSearch} placeholder="Search name, number, note..." style={styles.search} />
      <View style={styles.filterRow}>
        {(['ALL', 'INCOMING', 'OUTGOING', 'MISSED'] as Filter[]).map(item => (
          <Text key={item} onPress={() => setFilter(item)} style={[styles.filter, filter === item && styles.filterActive]}>{item}</Text>
        ))}
      </View>
      <View style={styles.button}><Button title={recentOnly ? 'Show All Dates' : 'Filter: Last 7 Days'} onPress={() => setRecentOnly(value => !value)} /></View>
      <Text style={styles.count}>Showing {visibleCalls.length} of {calls.length} saved records</Text>

      {visibleCalls.map(call => (
        <View key={call.id} style={styles.card}>
          <Text style={styles.name}>{call.name || 'Unknown contact'}</Text>
          <Text>Number: {call.phoneNumber || 'Unavailable'}</Text>
          <Text>Type: {call.type || 'Unavailable'}</Text>
          <Text>Date/time: {formatTimestamp(call.timestamp)}</Text>
          <Text>Duration: {call.duration} seconds</Text>
          <Text style={styles.syncStatus}>API: {call.syncStatus === 'synced' ? 'Synced' : 'Pending upload'}</Text>
          <Text style={styles.noteLabel}>Note</Text>
          <TextInput
            value={noteDrafts[call.id] ?? call.note ?? ''}
            onChangeText={value => setNoteDrafts(previous => ({...previous, [call.id]: value}))}
            placeholder="Add a note for this call..."
            multiline
            style={styles.noteInput}
          />
          <Button title="Save Note" onPress={() => void saveNote(call)} />
        </View>
      ))}
      {visibleCalls.length === 0 && <Text style={styles.empty}>No records match your search/filter.</Text>}
      <Text style={styles.footer}>Zez stores records locally. API sync requires the backend to be running and reachable.</Text>
    </ScrollView>
  );
}

function Stat({label, value}: {label: string; value: number}) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function formatTimestamp(value: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return value || 'Unavailable';
  const date = new Date(number);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

const styles = StyleSheet.create({
  container: {flexGrow: 1, padding: 18, paddingTop: 48, paddingBottom: 40, backgroundColor: '#f3f5f9'},
  title: {fontSize: 34, fontWeight: 'bold', color: '#202b54'},
  subtitle: {fontSize: 17, marginTop: 4, marginBottom: 12, color: '#475467'},
  message: {fontSize: 13, marginBottom: 14, color: '#344054'},
  panel: {padding: 14, borderRadius: 12, backgroundColor: '#fff', marginBottom: 12, borderWidth: 1, borderColor: '#e4e7ec'},
  sectionTitle: {fontSize: 19, fontWeight: 'bold', color: '#202b54', marginTop: 14, marginBottom: 8},
  statsRow: {flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap'},
  stat: {minWidth: '22%', paddingVertical: 8, alignItems: 'center'},
  statValue: {fontSize: 22, fontWeight: 'bold', color: '#202b54'},
  statLabel: {fontSize: 11, color: '#475467'},
  small: {fontSize: 12, marginTop: 6, color: '#475467'},
  button: {marginBottom: 8},
  spinner: {marginVertical: 12},
  search: {backgroundColor: '#fff', borderColor: '#d0d5dd', borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, color: '#101828'},
  filterRow: {flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, marginBottom: 4},
  filter: {paddingHorizontal: 10, paddingVertical: 8, marginRight: 6, marginBottom: 6, borderRadius: 18, backgroundColor: '#e4e7ec', color: '#344054', overflow: 'hidden', fontSize: 11, fontWeight: 'bold'},
  filterActive: {backgroundColor: '#202b54', color: '#fff'},
  count: {fontSize: 15, fontWeight: 'bold', marginVertical: 10, color: '#202b54'},
  card: {marginTop: 10, padding: 14, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e4e7ec'},
  name: {fontSize: 17, fontWeight: 'bold', marginBottom: 7, color: '#202b54'},
  syncStatus: {marginTop: 5, fontSize: 12, color: '#475467'},
  noteLabel: {fontWeight: 'bold', marginTop: 10, marginBottom: 4, color: '#344054'},
  noteInput: {minHeight: 54, borderWidth: 1, borderColor: '#d0d5dd', borderRadius: 8, padding: 9, marginBottom: 8, textAlignVertical: 'top', backgroundColor: '#fff', color: '#101828'},
  empty: {padding: 18, textAlign: 'center', color: '#667085'},
  footer: {marginTop: 22, fontSize: 11, color: '#667085', textAlign: 'center'},
});
