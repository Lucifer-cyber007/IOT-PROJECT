import { CameraView, useCameraPermissions } from "expo-camera";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SafeButton from "../components/SafeButton";
import { MAX_FILE_BYTES, type PickedFile } from "../lib/api";
import { colors, radius, spacing } from "../lib/theme";

interface CaptureScreenProps {
  onSubmit: (file: PickedFile) => void;
}

function guessMimeType(uri: string, provided?: string | null): string {
  if (provided && provided !== "application/octet-stream") return provided;
  const lower = uri.split("?")[0].toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function fileNameFrom(uri: string, fallback: string): string {
  const last = uri.split("?")[0].split("/").pop();
  return last && last.includes(".") ? last : fallback;
}

export default function CaptureScreen({ onSubmit }: CaptureScreenProps) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captured, setCaptured] = useState<PickedFile | null>(null);

  const takePhoto = async () => {
    if (!cameraRef.current || !isCameraReady || isCapturing) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (!photo?.uri) {
        Alert.alert("Capture failed", "The photo could not be saved. Please try again.");
        return;
      }
      setCaptured({
        uri: photo.uri,
        name: "bill-capture.jpg",
        mimeType: "image/jpeg",
      });
    } catch (error) {
      Alert.alert(
        "Capture failed",
        error instanceof Error ? error.message : "The camera could not take a photo."
      );
    } finally {
      setIsCapturing(false);
    }
  };

  const tooLarge = (size?: number) => {
    if (size !== undefined && size > MAX_FILE_BYTES) {
      Alert.alert(
        "File too large",
        `That file is ${(size / (1024 * 1024)).toFixed(1)} MB. The limit is 10 MB.`
      );
      return true;
    }
    return false;
  };

  const pickFromLibrary = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      if (tooLarge(asset.fileSize)) return;

      setCaptured({
        uri: asset.uri,
        name: asset.fileName ?? fileNameFrom(asset.uri, "bill.jpg"),
        mimeType: guessMimeType(asset.uri, asset.mimeType),
      });
    } catch (error) {
      Alert.alert(
        "Couldn't open photos",
        error instanceof Error ? error.message : "The photo library could not be opened."
      );
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      if (tooLarge(asset.size ?? undefined)) return;

      setCaptured({
        uri: asset.uri,
        name: asset.name ?? fileNameFrom(asset.uri, "bill.pdf"),
        mimeType: guessMimeType(asset.name ?? asset.uri, asset.mimeType),
      });
    } catch (error) {
      Alert.alert(
        "Couldn't open files",
        error instanceof Error ? error.message : "The file picker could not be opened."
      );
    }
  };

  // --- Permission gates -----------------------------------------------------

  if (!permission) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.white} />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    const blockedForGood = !permission.canAskAgain;
    return (
      <SafeAreaView style={styles.centered} edges={["top", "bottom"]}>
        <View style={styles.permissionCard}>
          <Text style={styles.permissionTitle}>
            {blockedForGood ? "Camera access is blocked" : "Camera access needed"}
          </Text>
          <Text style={styles.permissionBody}>
            {blockedForGood
              ? "Enable the camera for Bill Extractor in your device settings, or pick a saved bill instead."
              : "Bill Extractor uses the camera to photograph your electricity bill. Nothing is stored on the device."}
          </Text>

          <SafeButton
            style={styles.primaryButton}
            onPress={() => (blockedForGood ? Linking.openSettings() : requestPermission())}
          >
            <Text style={styles.primaryButtonText}>
              {blockedForGood ? "Open Settings" : "Allow Camera"}
            </Text>
          </SafeButton>

          <SafeButton style={styles.secondaryButton} onPress={pickDocument}>
            <Text style={styles.secondaryButtonText}>Choose a file instead</Text>
          </SafeButton>
          <SafeButton style={styles.secondaryButton} onPress={pickFromLibrary}>
            <Text style={styles.secondaryButtonText}>Pick from photos</Text>
          </SafeButton>
        </View>
      </SafeAreaView>
    );
  }

  // --- Review a captured/picked file ---------------------------------------

  if (captured) {
    const isPdf = captured.mimeType === "application/pdf";
    return (
      <SafeAreaView style={styles.reviewScreen} edges={["top", "bottom"]}>
        <Text style={styles.reviewHeading}>Use this bill?</Text>

        <View style={styles.reviewImageWrap}>
          {isPdf ? (
            <View style={styles.pdfCard}>
              <Text style={styles.pdfBadge}>PDF</Text>
              <Text style={styles.pdfName} numberOfLines={2}>
                {captured.name}
              </Text>
            </View>
          ) : (
            <Image
              source={{ uri: captured.uri }}
              style={styles.reviewImage}
              resizeMode="contain"
            />
          )}
        </View>

        <View style={styles.reviewActions}>
          <SafeButton style={styles.secondaryButton} onPress={() => setCaptured(null)}>
            <Text style={styles.secondaryButtonText}>Retake</Text>
          </SafeButton>
          <SafeButton style={styles.primaryButton} onPress={() => onSubmit(captured)}>
            <Text style={styles.primaryButtonText}>Extract Details</Text>
          </SafeButton>
        </View>
      </SafeAreaView>
    );
  }

  // --- Live camera ----------------------------------------------------------

  return (
    <View style={styles.cameraScreen}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        onCameraReady={() => setIsCameraReady(true)}
      />

      <SafeAreaView style={styles.cameraOverlay} edges={["top", "bottom"]}>
        <View style={styles.cameraHeader}>
          <Text style={styles.cameraTitle}>Electricity Bill Extractor</Text>
          <Text style={styles.cameraHint}>
            Fill the frame with the bill. Keep it flat and well lit.
          </Text>
        </View>

        <View style={styles.frameGuide} pointerEvents="none" />

        <View style={styles.cameraControls}>
          <SafeButton
            style={styles.roundButton}
            onPress={pickFromLibrary}
            accessibilityLabel="Pick a bill from your photos"
          >
            <Text style={styles.roundButtonText}>Photos</Text>
          </SafeButton>

          <Pressable
            onPress={takePhoto}
            disabled={!isCameraReady || isCapturing}
            accessibilityLabel="Take a photo of the bill"
            style={[styles.shutterOuter, !isCameraReady && styles.shutterDisabled]}
          >
            <View style={styles.shutterInner}>
              {isCapturing && <ActivityIndicator color={colors.ink} />}
            </View>
          </Pressable>

          <SafeButton
            style={styles.roundButton}
            onPress={pickDocument}
            accessibilityLabel="Pick a PDF or image file"
          >
            <Text style={styles.roundButtonText}>File</Text>
          </SafeButton>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink,
    padding: spacing.xl,
  },
  permissionCard: {
    width: "100%",
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.ink,
  },
  permissionBody: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.slate500,
    marginBottom: spacing.sm,
  },
  cameraScreen: {
    flex: 1,
    backgroundColor: "#000",
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: "space-between",
  },
  cameraHeader: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  cameraTitle: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 6,
  },
  cameraHint: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    textAlign: "center",
    marginTop: spacing.xs,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 6,
  },
  frameGuide: {
    position: "absolute",
    top: "16%",
    bottom: "22%",
    left: "6%",
    right: "6%",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.45)",
    borderRadius: radius.lg,
    borderStyle: "dashed",
  },
  cameraControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.lg,
  },
  roundButton: {
    minWidth: 68,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: "rgba(15,23,42,0.6)",
    alignItems: "center",
  },
  roundButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "600",
  },
  shutterOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  shutterDisabled: {
    opacity: 0.4,
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewScreen: {
    flex: 1,
    backgroundColor: colors.ink,
    padding: spacing.lg,
  },
  reviewHeading: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: spacing.md,
  },
  reviewImageWrap: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.inkSoft,
  },
  reviewImage: {
    flex: 1,
    width: "100%",
  },
  pdfCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  pdfBadge: {
    color: colors.rose,
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 2,
  },
  pdfName: {
    color: colors.slate300,
    fontSize: 14,
    textAlign: "center",
  },
  reviewActions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: colors.white,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: "center",
  },
  primaryButtonText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.slate300,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: colors.slate500,
    fontSize: 15,
    fontWeight: "600",
  },
});
