import { isAppleMobile } from './installOffer.ts';

export const LOCATION_UNAVAILABLE_MESSAGE = "Can't find your location. Still trying.";

/** @returns how to allow location on this kind of device */
export function locationDeniedMessage(appName: string, userAgent: string, maxTouchPoints: number): string {
  const notAllowed = `${appName} is not allowed to see your location.`;
  if (isAppleMobile(userAgent, maxTouchPoints)) {
    return (
      `${notAllowed} To turn it on, open the Settings app, tap Privacy & Security, ` +
      'then Location Services. Turn Location Services on, tap Safari Websites, and pick While Using the App. ' +
      `Then close and reopen ${appName}.`
    );
  }
  if (/Android/.test(userAgent)) {
    return (
      `${notAllowed} To turn it on, make sure Location is on in your quick settings. ` +
      'Then open Chrome, tap the menu, then Settings, Site settings, Location, and allow this site. ' +
      `Then close and reopen ${appName}.`
    );
  }
  return `${notAllowed} Allow location for this site in your browser settings, then reload the page.`;
}
