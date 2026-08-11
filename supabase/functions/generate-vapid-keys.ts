// One-time VAPID key generation for the turn-push function:
//
//   deno run supabase/functions/generate-vapid-keys.ts
//
// Store the private JSON as an edge function secret and the public key in the
// web app's build env:
//
//   supabase secrets set VAPID_KEYS='<vapid keys json>'
//   VITE_VAPID_PUBLIC_KEY=<public key>

import * as webpush from "jsr:@negrel/webpush@0.5.0";

const keys = await webpush.generateVapidKeys({ extractable: true });
const exported = await webpush.exportVapidKeys(keys);
const publicKey = await webpush.exportApplicationServerKey(keys);

console.log("VAPID_KEYS (edge function secret):");
console.log(JSON.stringify(exported));
console.log("\nVITE_VAPID_PUBLIC_KEY (web app build env):");
console.log(publicKey);
