import { isAppleMobile } from './installOffer.ts';

export const LOCATION_UNAVAILABLE_MESSAGE = "Can't find your location. Still trying.";

const IPHONE_STEPS =
  'Circle Scout is not allowed to see your location. To turn it on, open the Settings app, tap Privacy & Security, ' +
  'then Location Services. Turn Location Services on, tap Safari Websites, and pick While Using the App. ' +
  'Then close and reopen Circle Scout.';
const ANDROID_STEPS =
  'Circle Scout is not allowed to see your location. To turn it on, make sure Location is on in your quick settings. ' +
  'Then open Chrome, tap the menu, then Settings, Site settings, Location, and allow this site. ' +
  'Then close and reopen Circle Scout.';
const OTHER_STEPS =
  'Circle Scout is not allowed to see your location. Allow location for this site in your browser settings, then reload the page.';

/** @returns how to allow location on this kind of device */
export function locationDeniedMessage(userAgent: string, maxTouchPoints: number): string {
  if (isAppleMobile(userAgent, maxTouchPoints)) return IPHONE_STEPS;
  if (/Android/.test(userAgent)) return ANDROID_STEPS;
  return OTHER_STEPS;
}
