/**
 * Match photos to the current guest — local device id AND the per-event
 * server guest id returned by POST /api/session (they differ by design).
 */

import { getGuest } from '@/state/guest.js';
import { getServerGuestId } from '@/services/api/index.js';

/** All guest ids that belong to this device for the active event. */
export function myGuestIds() {
  const guest = getGuest();
  if (!guest) return [];
  const ids = [guest.id];
  const serverId = getServerGuestId();
  if (serverId && !ids.includes(serverId)) ids.push(serverId);
  return ids;
}

/** True when a shot was captured by the current guest on this device. */
export function isMyShot(shot) {
  if (!shot || shot.seed) return false;
  const guestId = shot.guestId;
  if (!guestId) return false;
  return myGuestIds().includes(guestId);
}
