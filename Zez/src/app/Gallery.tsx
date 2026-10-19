import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as MediaLibrary from "expo-media-library/legacy";
import * as Sharing from "expo-sharing";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppTheme } from "@/context/ThemeContext";

type Asset = MediaLibrary.Asset;
type Album = MediaLibrary.Album;
type Tab = "all" | "albums" | "videos" | "favorites";

const PAGE_SIZE = 500;

export default function GalleryScreen() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [selectedFileSize, setSelectedFileSize] = useState<number | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  const [moreVisible, setMoreVisible] = useState(false);
  // const [darkMode, setDarkMode] = useState(false);

  // const colors = darkMode
  //   ? {
  //       background: "#101114",
  //       surface: "#1C1E23",
  //       text: "#F4F4F5",
  //       muted: "#A1A1AA",
  //       border: "#303238",
  //       accent: "#38BDF8",
  //     }
  //   : {
  //       background: "#F6F7FB",
  //       surface: "#FFFFFF",
  //       text: "#18181B",
  //       muted: "#71717A",
  //       border: "#E5E7EB",
  //       accent: "#0284C7",
  //     };

  // const styles = useMemo(() => createStyles(colors), [colors]);

  const { darkMode, colors: appColors } = useAppTheme();

  const colors = useMemo(
    () => ({
      background: appColors.background,
      surface: appColors.card,
      text: appColors.text,
      muted: appColors.muted,
      border: appColors.border,
      accent: appColors.active,
    }),
    [appColors]
  );

  const styles = useMemo(
    () => createStyles(colors),
    [colors]
  );
  const loadGallery = useCallback(async (showLoader = true) => {
    if (showLoader) {
      setLoading(true);
    }

    try {
      let permission = await MediaLibrary.getPermissionsAsync(
        false,
        ["photo", "video"]
      );

      if (!permission.granted && permission.canAskAgain) {
        permission = await MediaLibrary.requestPermissionsAsync(
          false,
          ["photo", "video"]
        );
      }

      setPermissionGranted(permission.granted);
      setCanAskAgain(permission.canAskAgain);

      if (!permission.granted) {
        setAssets([]);
        setAlbums([]);
        return;
      }

      const [assetResult, albumResult] = await Promise.all([
        MediaLibrary.getAssetsAsync({
          first: PAGE_SIZE,
          mediaType: [
            MediaLibrary.MediaType.photo,
            MediaLibrary.MediaType.video,
          ],
          sortBy: [MediaLibrary.SortBy.creationTime],
        }),
        MediaLibrary.getAlbumsAsync(),
      ]);

      setAssets(assetResult.assets);
      setAlbums(albumResult);
    } catch (error) {
      console.error("[Gallery] Failed to load media:", error);
      Alert.alert(
        "Unable to load gallery",
        "The gallery could not access your photos and videos. Check Android media permissions and try again."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadGallery();
  }, [loadGallery]);

  const requestAccess = async () => {
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(
        false,
        ["photo", "video"]
      );

      setPermissionGranted(permission.granted);
      setCanAskAgain(permission.canAskAgain);

      if (permission.granted) {
        await loadGallery();
      } else {
        Alert.alert(
          "Permission required",
          permission.canAskAgain
            ? "Allow photo and video access to display your gallery."
            : "Photo and video access is disabled. Open your Android app settings and allow access to photos and videos."
        );
      }
    } catch (error) {
      console.error("[Gallery] Permission request failed:", error);
      Alert.alert("Permission error", "Could not request media permissions.");
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    void loadGallery(false);
  };

  const openPreview = async (asset: Asset) => {
    setSelectedAsset(asset);
    setSelectedFileSize(null);
    setPreviewVisible(true);
    setInfoVisible(false);
    setMoreVisible(false);

    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset.id);
      const fileSize = (info as typeof info & { size?: number }).size;
      setSelectedFileSize(
        typeof fileSize  === "number" ? fileSize  : null
      );
    } catch (error) {
      console.warn("[Gallery] Could not load asset details:", error);
    }
  };

  const closePreview = () => {
    setPreviewVisible(false);
    setInfoVisible(false);
    setMoreVisible(false);
    setSelectedAsset(null);
    setSelectedFileSize(null);
  };

  const toggleFavorite = (asset: Asset) => {
    setFavorites((current) =>
      current.includes(asset.id)
        ? current.filter((id) => id !== asset.id)
        : [...current, asset.id]
    );
  };

  const shareAsset = async (asset: Asset) => {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset.id);
      const uri = info.localUri ?? info.uri ?? asset.uri;

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        await Share.share({
          message: uri,
          url: uri,
        });
      }
    } catch (error) {
      console.error("[Gallery] Share failed:", error);
      Alert.alert("Unable to share", "Could not share this media file.");
    }
  };

  const deleteAsset = (asset: Asset) => {
    Alert.alert(
      "Delete media?",
      "This may remove the selected item from your device. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const deleted = await MediaLibrary.deleteAssetsAsync([
                asset.id,
              ]);

              if (deleted) {
                setAssets((current) =>
                  current.filter((item) => item.id !== asset.id)
                );
                setFavorites((current) =>
                  current.filter((id) => id !== asset.id)
                );
                closePreview();
                await loadGallery(false);
              }
            } catch (error) {
              console.error("[Gallery] Delete failed:", error);
              Alert.alert(
                "Delete failed",
                "Android may require you to approve the deletion."
              );
            }
          },
        },
      ]
    );
  };

  const formatBytes = (
    bytes: number | null | undefined
  ): string => {
    if (bytes == null || !Number.isFinite(bytes)) {
      return "Unknown";
    }

    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDate = (timestamp: number) => {
    if (!timestamp) {
      return "Unknown";
    }

    return new Date(timestamp * 1000).toLocaleString();
  };

  const filteredAssets = useMemo(() => {
    let result = assets;

    if (selectedAlbum && tab !== "videos" && tab !== "favorites") {
      result = result.filter((asset) =>
        selectedAlbum ? asset.albumId === selectedAlbum.id : true
      );
    }

    if (tab === "videos") {
      result = result.filter((asset) => asset.mediaType === "video");
    } else if (tab === "favorites") {
      result = result.filter((asset) => favorites.includes(asset.id));
    }

    const query = search.trim().toLowerCase();

    if (query) {
      result = result.filter((asset) =>
        asset.filename.toLowerCase().includes(query)
      );
    }

    return result;
  }, [assets, selectedAlbum, tab, favorites, search]);

  const photos = assets.filter((asset) => asset.mediaType === "photo");
  const videos = assets.filter((asset) => asset.mediaType === "video");

  const renderThumbnail = (asset: Asset) => (
    <Pressable
      key={asset.id}
      style={styles.thumbnail}
      onPress={() => void openPreview(asset)}
    >
      <Image
        source={{ uri: asset.uri }}
        style={styles.thumbnailImage}
        resizeMode="cover"
      />
      {asset.mediaType === "video" && (
        <View style={styles.videoBadge}>
          <Text style={styles.videoBadgeText}>▶</Text>
        </View>
      )}
      {favorites.includes(asset.id) && (
        <View style={styles.favoriteBadge}>
          <Text style={styles.favoriteBadgeText}>♥</Text>
        </View>
      )}
    </Pressable>
  );

  const renderSectionTitle = (title: string, count: number) => (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.countText}>{count}</Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <StatusBar barStyle={darkMode ? "light-content" : "dark-content"} />
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading your gallery...</Text>
      </SafeAreaView>
    );
  }

  if (!permissionGranted) {
    return (
      <SafeAreaView style={styles.centered}>
        <StatusBar barStyle={darkMode ? "light-content" : "dark-content"} />
        <Text style={styles.permissionIcon}>▧</Text>
        <Text style={styles.permissionTitle}>Gallery access needed</Text>
        <Text style={styles.permissionText}>
          Allow access to photos and videos so Zez can display your device
          gallery.
        </Text>
        <Pressable style={styles.primaryButton} onPress={requestAccess}>
          <Text style={styles.primaryButtonText}>
            {canAskAgain ? "Allow access" : "Try permissions again"}
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar
        barStyle={darkMode ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>YOUR MEDIA</Text>
          <Text style={styles.headerTitle}>Gallery</Text>
        </View>

        <Pressable
          style={styles.themeButton}
          // onPress={() => setDarkMode((value) => !value)}
        >
          <Text style={styles.themeButtonText}>
            {darkMode ? "☀" : "☾"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search photos and videos"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")}>
            <Text style={styles.clearSearch}>✕</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>▧</Text>
            <Text style={styles.statNumber}>{photos.length}</Text>
            <Text style={styles.statLabel}>Photos</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statIcon}>▷</Text>
            <Text style={styles.statNumber}>{videos.length}</Text>
            <Text style={styles.statLabel}>Videos</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statIcon}>♡</Text>
            <Text style={styles.statNumber}>{favorites.length}</Text>
            <Text style={styles.statLabel}>Favorites</Text>
          </View>
        </View>

        {renderSectionTitle("Recent photos", photos.length)}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.recentRow}
        >
          {photos.slice(0, 8).map(renderThumbnail)}
          {photos.length === 0 && (
            <Text style={styles.emptyText}>No photos found.</Text>
          )}
        </ScrollView>

        {renderSectionTitle("Albums", albums.length)}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.albumRow}
        >
          {albums.map((album) => (
            <Pressable
              key={album.id}
              style={[
                styles.albumCard,
                selectedAlbum?.id === album.id && styles.selectedAlbumCard,
              ]}
              onPress={() => {
                setSelectedAlbum(
                  selectedAlbum?.id === album.id ? null : album
                );
                setTab("all");
              }}
            >
              <View style={styles.albumIconBox}>
                <Text style={styles.albumIcon}>▤</Text>
              </View>
              <Text numberOfLines={1} style={styles.albumName}>
                {album.title}
              </Text>
              <Text style={styles.albumSubtitle}>Open album</Text>
            </Pressable>
          ))}
          {albums.length === 0 && (
            <Text style={styles.emptyText}>No albums found.</Text>
          )}
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
        >
          {(
            [
              ["all", "All media"],
              ["albums", "Albums"],
              ["videos", "Videos"],
              ["favorites", "Favorites"],
            ] as [Tab, string][]
          ).map(([value, label]) => (
            <Pressable
              key={value}
              style={[
                styles.tab,
                tab === value && styles.activeTab,
              ]}
              onPress={() => {
                setTab(value);
                if (value !== "all") {
                  setSelectedAlbum(null);
                }
              }}
            >
              <Text
                style={[
                  styles.tabText,
                  tab === value && styles.activeTabText,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {renderSectionTitle(
          selectedAlbum?.title ??
            (tab === "videos"
              ? "Videos"
              : tab === "favorites"
                ? "Favorites"
                : "All media"),
          filteredAssets.length
        )}

        <View style={styles.grid}>
          {filteredAssets.map(renderThumbnail)}
        </View>

        {filteredAssets.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>▧</Text>
            <Text style={styles.emptyStateTitle}>Nothing here yet</Text>
            <Text style={styles.emptyText}>
              Try another album or search term.
            </Text>
          </View>
        )}

        {assets.length >= PAGE_SIZE && (
          <Text style={styles.footerNote}>
            Showing the latest {PAGE_SIZE} media items.
          </Text>
        )}
      </ScrollView>

      <Modal
        visible={previewVisible}
        animationType="fade"
        onRequestClose={closePreview}
        statusBarTranslucent
      >
        <View style={styles.previewScreen}>
          <View style={styles.previewHeader}>
            <Pressable onPress={closePreview} style={styles.previewHeaderButton}>
              <Text style={styles.previewHeaderButtonText}>‹</Text>
            </Pressable>
            <View style={styles.previewTitleWrap}>
              <Text numberOfLines={1} style={styles.previewTitle}>
                {selectedAsset?.filename ?? "Media"}
              </Text>
              <Text style={styles.previewSubtitle}>
                {selectedAsset
                  ? formatDate(selectedAsset.creationTime)
                  : ""}
              </Text>
            </View>
            <Pressable
              onPress={() => setMoreVisible(true)}
              style={styles.previewHeaderButton}
            >
              <Text style={styles.previewHeaderButtonText}>⋮</Text>
            </Pressable>
          </View>

          <View style={styles.previewImageArea}>
            {selectedAsset?.mediaType === "photo" && (
              <Image
                source={{ uri: selectedAsset.uri }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            )}

            {selectedAsset?.mediaType === "video" && (
              <View style={styles.videoPreview}>
                <Text style={styles.videoPreviewIcon}>▶</Text>
                <Text style={styles.videoPreviewText}>
                  Video preview is not available in this viewer.
                </Text>
                <Text style={styles.videoPreviewText}>
                  Use Share to open it in a compatible app.
                </Text>
              </View>
            )}
          </View>

          <View style={styles.previewActions}>
            <Pressable
              style={styles.actionButton}
              onPress={() => {
                if (selectedAsset) {
                  void shareAsset(selectedAsset);
                }
              }}
            >
              <Text style={styles.actionIcon}>↗</Text>
              <Text style={styles.actionLabel}>Share</Text>
            </Pressable>

            <Pressable
              style={styles.actionButton}
              onPress={() => {
                if (selectedAsset) {
                  toggleFavorite(selectedAsset);
                }
              }}
            >
              <Text style={styles.actionIcon}>
                {selectedAsset && favorites.includes(selectedAsset.id)
                  ? "♥"
                  : "♡"}
              </Text>
              <Text style={styles.actionLabel}>Favorite</Text>
            </Pressable>

            <Pressable
              style={styles.actionButton}
              onPress={() => setInfoVisible(true)}
            >
              <Text style={styles.actionIcon}>ⓘ</Text>
              <Text style={styles.actionLabel}>Info</Text>
            </Pressable>

            <Pressable
              style={styles.actionButton}
              onPress={() => {
                if (selectedAsset) {
                  deleteAsset(selectedAsset);
                }
              }}
            >
              <Text style={styles.actionIcon}>⌫</Text>
              <Text style={styles.actionLabel}>Delete</Text>
            </Pressable>
          </View>

          <Modal
            visible={infoVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setInfoVisible(false)}
          >
            <View style={styles.sheetOverlay}>
              <Pressable
                style={styles.overlayDismiss}
                onPress={() => setInfoVisible(false)}
              />
              <View style={styles.infoSheet}>
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetTitle}>Media information</Text>

                {selectedAsset && (
                  <ScrollView>
                    {[
                      ["Name", selectedAsset.filename],
                      [
                        "Date",
                        formatDate(selectedAsset.creationTime),
                      ],
                      [
                        "Size",
                        formatBytes(selectedFileSize),
                      ],
                      [
                        "Dimensions",
                        `${selectedAsset.width} × ${selectedAsset.height} px`,
                      ],
                      ["Type", selectedAsset.mediaType],
                      ["Album", selectedAsset.albumId ?? "Unknown"],
                      ["URI", selectedAsset.uri],
                    ].map(([label, value]) => (
                      <View key={label} style={styles.infoRow}>
                        <Text style={styles.infoLabel}>{label}</Text>
                        <Text selectable style={styles.infoValue}>
                          {value || "Unknown"}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                )}

                <Pressable
                  style={styles.sheetCloseButton}
                  onPress={() => setInfoVisible(false)}
                >
                  <Text style={styles.sheetCloseText}>Close</Text>
                </Pressable>
              </View>
            </View>
          </Modal>

          <Modal
            visible={moreVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setMoreVisible(false)}
          >
            <View style={styles.sheetOverlay}>
              <Pressable
                style={styles.overlayDismiss}
                onPress={() => setMoreVisible(false)}
              />
              <View style={styles.moreSheet}>
                <Text style={styles.sheetTitle}>More options</Text>

                <Pressable
                  style={styles.moreOption}
                  onPress={() => {
                    setMoreVisible(false);
                    setInfoVisible(true);
                  }}
                >
                  <Text style={styles.moreOptionText}>ⓘ  View information</Text>
                </Pressable>

                <Pressable
                  style={styles.moreOption}
                  onPress={() => {
                    setMoreVisible(false);
                    if (selectedAsset) {
                      void shareAsset(selectedAsset);
                    }
                  }}
                >
                  <Text style={styles.moreOptionText}>↗  Share media</Text>
                </Pressable>

                <Pressable
                  style={styles.moreOption}
                  onPress={() => {
                    if (selectedAsset) {
                      toggleFavorite(selectedAsset);
                    }
                    setMoreVisible(false);
                  }}
                >
                  <Text style={styles.moreOptionText}>♡  Toggle favorite</Text>
                </Pressable>

                <Pressable
                  style={styles.moreOption}
                  onPress={() => {
                    setMoreVisible(false);
                    Alert.alert(
                      "Not available yet",
                      "Rename, move, copy, compress, edit and set-wallpaper actions are not implemented in this version."
                    );
                  }}
                >
                  <Text style={styles.moreOptionText}>
                    ⋯  Other file actions
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.sheetCloseButton}
                  onPress={() => setMoreVisible(false)}
                >
                  <Text style={styles.sheetCloseText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </Modal>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(colors: {
  background: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
}) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 28,
      backgroundColor: colors.background,
    },
    header: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 18,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    eyebrow: {
      color: colors.accent,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 2,
    },
    headerTitle: {
      color: colors.text,
      fontSize: 30,
      fontWeight: "800",
      marginTop: 3,
    },
    themeButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    themeButtonText: {
      color: colors.text,
      fontSize: 23,
    },
    searchBox: {
      marginHorizontal: 20,
      marginBottom: 18,
      backgroundColor: colors.surface,
      borderRadius: 15,
      paddingHorizontal: 14,
      height: 48,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchIcon: {
      fontSize: 24,
      color: colors.muted,
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      color: colors.text,
      fontSize: 14,
    },
    clearSearch: {
      color: colors.muted,
      fontSize: 17,
      padding: 6,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 35,
    },
    statsRow: {
      flexDirection: "row",
      paddingHorizontal: 20,
      gap: 10,
      marginBottom: 26,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingVertical: 15,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statIcon: {
      color: colors.accent,
      fontSize: 21,
      marginBottom: 7,
    },
    statNumber: {
      color: colors.text,
      fontSize: 23,
      fontWeight: "800",
    },
    statLabel: {
      color: colors.muted,
      fontSize: 12,
      marginTop: 3,
    },
    sectionTitleRow: {
      paddingHorizontal: 20,
      marginTop: 5,
      marginBottom: 13,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: "800",
    },
    countText: {
      color: colors.muted,
      fontSize: 12,
    },
    recentRow: {
      paddingHorizontal: 20,
      gap: 10,
      paddingBottom: 25,
    },
    thumbnail: {
      width: 106,
      height: 106,
      borderRadius: 12,
      overflow: "hidden",
      backgroundColor: colors.border,
      marginBottom: 3,
    },
    thumbnailImage: {
      width: "100%",
      height: "100%",
    },
    videoBadge: {
      position: "absolute",
      right: 6,
      bottom: 6,
      backgroundColor: "#0009",
      paddingHorizontal: 7,
      paddingVertical: 4,
      borderRadius: 8,
    },
    videoBadgeText: {
      color: "#FFFFFF",
      fontSize: 12,
    },
    favoriteBadge: {
      position: "absolute",
      top: 5,
      right: 6,
      backgroundColor: "#0009",
      borderRadius: 12,
      paddingHorizontal: 5,
      paddingVertical: 2,
    },
    favoriteBadgeText: {
      color: "#FF6B81",
      fontSize: 13,
    },
    albumRow: {
      paddingHorizontal: 20,
      gap: 11,
      paddingBottom: 25,
    },
    albumCard: {
      width: 132,
      padding: 12,
      borderRadius: 15,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    selectedAlbumCard: {
      borderColor: colors.accent,
      borderWidth: 2,
    },
    albumIconBox: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.background,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 10,
    },
    albumIcon: {
      color: colors.accent,
      fontSize: 22,
    },
    albumName: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "700",
    },
    albumSubtitle: {
      color: colors.muted,
      fontSize: 11,
      marginTop: 4,
    },
    tabsRow: {
      paddingHorizontal: 20,
      gap: 8,
      marginBottom: 22,
    },
    tab: {
      paddingHorizontal: 15,
      paddingVertical: 10,
      borderRadius: 22,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    activeTab: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    tabText: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "700",
    },
    activeTabText: {
      color: "#FFFFFF",
    },
    grid: {
      paddingHorizontal: 20,
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "flex-start",
      gap: 8,
    },
    emptyText: {
      color: colors.muted,
      fontSize: 13,
      paddingVertical: 12,
    },
    emptyState: {
      alignItems: "center",
      paddingVertical: 45,
      paddingHorizontal: 20,
    },
    emptyStateIcon: {
      color: colors.muted,
      fontSize: 38,
      marginBottom: 10,
    },
    emptyStateTitle: {
      color: colors.text,
      fontWeight: "800",
      fontSize: 17,
      marginBottom: 4,
    },
    footerNote: {
      color: colors.muted,
      textAlign: "center",
      fontSize: 11,
      marginTop: 20,
    },
    loadingText: {
      color: colors.text,
      marginTop: 15,
    },
    permissionIcon: {
      fontSize: 56,
      color: colors.accent,
      marginBottom: 12,
    },
    permissionTitle: {
      fontSize: 23,
      fontWeight: "800",
      color: colors.text,
      textAlign: "center",
    },
    permissionText: {
      color: colors.muted,
      fontSize: 14,
      textAlign: "center",
      lineHeight: 21,
      marginTop: 10,
      marginBottom: 22,
    },
    primaryButton: {
      backgroundColor: colors.accent,
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderRadius: 13,
    },
    primaryButtonText: {
      color: "#FFFFFF",
      fontWeight: "800",
    },
    previewScreen: {
      flex: 1,
      backgroundColor: "#080808",
    },
    previewHeader: {
      paddingTop: 45,
      paddingHorizontal: 15,
      paddingBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    previewHeaderButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    previewHeaderButtonText: {
      color: "#FFFFFF",
      fontSize: 30,
    },
    previewTitleWrap: {
      flex: 1,
    },
    previewTitle: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "700",
    },
    previewSubtitle: {
      color: "#A1A1AA",
      fontSize: 11,
      marginTop: 3,
    },
    previewImageArea: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    previewImage: {
      width: "100%",
      height: "100%",
    },
    videoPreview: {
      alignItems: "center",
      padding: 24,
    },
    videoPreviewIcon: {
      color: "#FFFFFF",
      fontSize: 50,
      marginBottom: 15,
    },
    videoPreviewText: {
      color: "#D4D4D8",
      textAlign: "center",
      marginBottom: 8,
    },
    previewActions: {
      flexDirection: "row",
      justifyContent: "space-around",
      paddingTop: 18,
      paddingBottom: 28,
      backgroundColor: "#141414",
    },
    actionButton: {
      alignItems: "center",
      minWidth: 60,
      gap: 7,
    },
    actionIcon: {
      color: "#FFFFFF",
      fontSize: 23,
    },
    actionLabel: {
      color: "#D4D4D8",
      fontSize: 11,
    },
    sheetOverlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "#0008",
    },
    overlayDismiss: {
      ...StyleSheet.absoluteFill,
    },
    infoSheet: {
      maxHeight: "78%",
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
      paddingBottom: 28,
    },
    moreSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
      paddingBottom: 28,
    },
    sheetHandle: {
      alignSelf: "center",
      width: 42,
      height: 4,
      borderRadius: 4,
      backgroundColor: colors.border,
      marginBottom: 18,
    },
    sheetTitle: {
      color: colors.text,
      fontSize: 19,
      fontWeight: "800",
      marginBottom: 15,
    },
    infoRow: {
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    infoLabel: {
      color: colors.muted,
      fontSize: 12,
      marginBottom: 5,
    },
    infoValue: {
      color: colors.text,
      fontSize: 13,
      lineHeight: 19,
    },
    sheetCloseButton: {
      marginTop: 18,
      alignItems: "center",
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 13,
    },
    sheetCloseText: {
      color: colors.text,
      fontWeight: "700",
    },
    moreOption: {
      paddingVertical: 15,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    moreOptionText: {
      color: colors.text,
      fontSize: 14,
    },
  });
}

