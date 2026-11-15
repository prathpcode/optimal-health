/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as bench from "../bench.js";
import type * as cache from "../cache.js";
import type * as drugRules from "../drugRules.js";
import type * as followups from "../followups.js";
import type * as http from "../http.js";
import type * as judge from "../judge.js";
import type * as lookup from "../lookup.js";
import type * as medications from "../medications.js";
import type * as members from "../members.js";
import type * as pay from "../pay.js";
import type * as pipeline from "../pipeline.js";
import type * as profile from "../profile.js";
import type * as rules from "../rules.js";
import type * as scans from "../scans.js";
import type * as shelf from "../shelf.js";
import type * as shelfData from "../shelfData.js";
import type * as together from "../together.js";
import type * as validators from "../validators.js";
import type * as whopSignature from "../whopSignature.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  bench: typeof bench;
  cache: typeof cache;
  drugRules: typeof drugRules;
  followups: typeof followups;
  http: typeof http;
  judge: typeof judge;
  lookup: typeof lookup;
  medications: typeof medications;
  members: typeof members;
  pay: typeof pay;
  pipeline: typeof pipeline;
  profile: typeof profile;
  rules: typeof rules;
  scans: typeof scans;
  shelf: typeof shelf;
  shelfData: typeof shelfData;
  together: typeof together;
  validators: typeof validators;
  whopSignature: typeof whopSignature;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
