import type { ReactNode } from "react";
import { StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from "react-native";

interface SafeButtonProps {
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  children: ReactNode;
}

// Some Android devices never paint Text/View content unless it sits inside
// an absolutely-positioned wrapper stacked on top of the touchable - a plain
// (non-absolute) sibling or a bare touchable child never paints. The outer
// view carries the real layout style (so flex/width behave normally in the
// parent), the touchable is an invisible full-fill overlay for taps, and the
// content wrapper is a full-fill overlay too, painted on top of the touchable.
export default function SafeButton({
  style,
  contentStyle,
  onPress,
  disabled,
  accessibilityLabel,
  children,
}: SafeButtonProps) {
  return (
    <View style={[style, { position: "relative" }, disabled && { opacity: 0.4 }]}>
      <TouchableOpacity
        style={StyleSheet.absoluteFillObject}
        onPress={onPress}
        disabled={disabled}
        accessibilityLabel={accessibilityLabel}
      />
      <View
        style={[
          StyleSheet.absoluteFillObject,
          { alignItems: "center", justifyContent: "center" },
          contentStyle,
        ]}
        pointerEvents="none"
      >
        {children}
      </View>
    </View>
  );
}
