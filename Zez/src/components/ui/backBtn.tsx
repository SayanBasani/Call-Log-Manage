import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function BackBtn(){
    return(
        <Pressable onPress={()=>router.back()}>
            <Text>← Back</Text>
        </Pressable>
    )
}