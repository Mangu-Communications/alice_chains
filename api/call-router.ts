/**
 * P-CALL-4. Issue ICE servers for the next 1:1 call invitation.
 *
 * Credentials are HMAC time-limited (MASTER.md §14.3). No ICE restart here.
 */
import { createRouter, authedQuery } from "./middleware";
import { callIceServers } from "./lib/turn";

export const turnRouter = createRouter({
  iceServers: authedQuery.query(() => callIceServers()),
});
