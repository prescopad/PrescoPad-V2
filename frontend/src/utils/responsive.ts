/**
 * responsive.ts
 * Central utility for adaptive scaling across all screen sizes.
 *
 * Baseline design: 375 × 812 (iPhone 11 / standard Android)
 *
 * Usage:
 *   rs(16)   → horizontally scaled (fonts, horizontal padding)
 *   vs(20)   → vertically scaled (vertical padding, heights)
 *   ms(14)   → moderately scaled (balanced – good default)
 *
 * Also exports helpers:
 *   screenWidth, screenHeight
 *   isSmallScreen  (< 360 wide)
 *   isLargeScreen  (>= 414 wide)
 *   HEADER_PADDING_TOP – correct paddingTop for screen headers
 */

import { Dimensions, Platform, StatusBar } from 'react-native';

export const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const BASE_WIDTH = 375;
const BASE_HEIGHT = 812;

/** Horizontal/font scaling – proportional to screen width */
export const rs = (size: number): number => (screenWidth / BASE_WIDTH) * size;

/** Vertical scaling – proportional to screen height */
export const vs = (size: number): number => (screenHeight / BASE_HEIGHT) * size;

/**
 * Moderate scale – prevents extreme values on very large/small devices.
 * @param size   baseline size
 * @param factor 0–1, how aggressively to scale (default 0.5)
 */
export const ms = (size: number, factor = 0.5): number =>
  size + (rs(size) - size) * factor;

export const isSmallScreen = screenWidth < 360;
export const isLargeScreen = screenWidth >= 414;

/**
 * Correct paddingTop for custom nav headers:
 *  – iOS   : no StatusBar overlap (SafeAreaView handles it)
 *  – Android: use actual StatusBar height so content sits below the bar
 */
export const HEADER_PADDING_TOP =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 4 : 8;

/**
 * Keyboard vertical offset for KeyboardAvoidingView on Android.
 * Represents the height of the status bar + a typical nav header (~56px).
 */
export const KEYBOARD_VERTICAL_OFFSET =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 56 : 0;
