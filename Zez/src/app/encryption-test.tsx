
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  encryptData,
  decryptData,
  generateEncryptionKey,
} from "@/utils/portableEncryption";

export default function EncryptionTest() {
  const [key, setKey] = useState("");
  const [encrypted, setEncrypted] = useState("");
  const [decrypted, setDecrypted] = useState("");
  const [message, setMessage] = useState("");

  const sample = {
    phoneNumber: "1234567890",
    name: "Test Contact",
    timestamp: new Date().toISOString(),
    type: "OUTGOING",
    duration: 45,
  };

  function testEncryption() {
    try {
      const secretKey = generateEncryptionKey();
      const ciphertext = encryptData(sample, secretKey);
      const restored = decryptData(ciphertext, secretKey);

      setKey(secretKey);
      setEncrypted(ciphertext);
      setDecrypted(JSON.stringify(restored, null, 2));
      setMessage("Encryption and decryption successful.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Test failed."
      );
    }
  }

  return (
    <ScrollView className="flex-1 bg-slate-950">
      <View className="gap-4 p-5">
        <Text className="text-2xl font-bold text-white">
          Portable Encryption Test
        </Text>

        <Pressable
          className="rounded-xl bg-blue-600 p-4"
          onPress={testEncryption}
        >
          <Text className="text-center font-semibold text-white">
            Test Encryption
          </Text>
        </Pressable>

        <Text className="text-green-400">{message}</Text>

        <Text className="font-bold text-white">
          Secret Key — keep private
        </Text>
        <Text selectable className="text-xs text-amber-300">
          {key}
        </Text>

        <Text className="font-bold text-white">Encrypted Data</Text>
        <Text selectable className="break-all text-xs text-blue-300">
          {encrypted}
        </Text>

        <Text className="font-bold text-white">Decrypted JSON</Text>
        <Text selectable className="text-xs text-slate-300">
          {decrypted}
        </Text>
      </View>
    </ScrollView>
  );
}
