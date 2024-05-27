// To parse this data:
//
//   import { Convert, DegaCw721QueryResponseMessages } from "./file";
//
//   const degaCw721QueryResponseMessages = Convert.toDegaCw721QueryResponseMessages(json);
//
// These functions will throw an error if the JSON doesn't
// match the expected interface, even if the JSON is valid.

export interface DegaCw721QueryResponseMessages {
    all_nft_info_response:    AllNftInfoResponseForNullableEmpty;
    approval_response:        ApprovalResponse;
    approvals_response:       ApprovalsResponse;
    check_royalties_response: CheckRoyaltiesResponse;
    collection_info_response: CollectionInfoResponse;
    contract_info_response:   ContractInfoResponse;
    minter_response:          MinterResponse;
    nft_info_response:        NftInfoResponseForNullableEmpty;
    num_tokens_response:      NumTokensResponse;
    operator_response:        OperatorResponse;
    operators_response:       OperatorsResponse;
    owner_of_response:        OwnerOfResponse;
    royalty_info_response:    RoyaltiesInfoResponse;
    tokens_response:          TokensResponse;
}

export interface AllNftInfoResponseForNullableEmpty {
    /**
     * Who can transfer the token
     */
    access: OwnerOfResponse;
    /**
     * Data on the token itself,
     */
    info: NftInfoResponseForNullableEmpty;
}

/**
 * Who can transfer the token
 */
export interface OwnerOfResponse {
    /**
     * If set this address is approved to transfer/send the token as well
     */
    approvals: Approval[];
    /**
     * Owner of the token
     */
    owner: string;
}

export interface Approval {
    /**
     * When the Approval expires (maybe Expiration::never)
     */
    expires: Expiration;
    /**
     * Account that can transfer/send the token
     */
    spender: string;
}

/**
 * When the Approval expires (maybe Expiration::never)
 *
 * Expiration represents a point in time when some event happens. It can compare with a
 * BlockInfo and will return is_expired() == true once the condition is hit (and for every
 * block in the future)
 *
 * AtHeight will expire when `env.block.height` >= height
 *
 * AtTime will expire when `env.block.time` >= time
 *
 * Never will never expire. Used to express the empty variant
 */
export interface Expiration {
    at_height?: number;
    at_time?:   string;
    never?:     Never;
}

export interface Never {
}

/**
 * Data on the token itself,
 */
export interface NftInfoResponseForNullableEmpty {
    /**
     * You can add any custom metadata here when you extend cw721-base
     */
    extension?: { [key: string]: any } | null;
    /**
     * Universal resource identifier for this NFT Should point to a JSON file that conforms to
     * the ERC721 Metadata JSON Schema
     */
    token_uri?: null | string;
}

export interface ApprovalResponse {
    approval: Approval;
}

export interface ApprovalsResponse {
    approvals: Approval[];
}

/**
 * Shows if the contract implements royalties if royalty_payments is true, marketplaces
 * should pay them
 */
export interface CheckRoyaltiesResponse {
    royalty_payments: boolean;
}

export interface CollectionInfoResponse {
    description:       string;
    external_link?:    null | string;
    image:             string;
    royalty_settings?: RoyaltySettingsResponse | null;
}

export interface RoyaltySettingsResponse {
    payment_address: string;
    share:           string;
}

export interface ContractInfoResponse {
    name:   string;
    symbol: string;
}

/**
 * Shows who can mint these tokens
 */
export interface MinterResponse {
    minter?: null | string;
}

export interface NumTokensResponse {
    count: number;
}

export interface OperatorResponse {
    approval: Approval;
}

export interface OperatorsResponse {
    operators: Approval[];
}

export interface RoyaltiesInfoResponse {
    address:        string;
    royalty_amount: string;
}

export interface TokensResponse {
    /**
     * Contains all token_ids in lexicographical ordering If there are more than `limit`, use
     * `start_after` in future queries to achieve pagination.
     */
    tokens: string[];
}

// Converts JSON strings to/from your types
// and asserts the results of JSON.parse at runtime
export class Convert {
    public static toDegaCw721QueryResponseMessages(json: string): DegaCw721QueryResponseMessages {
        return cast(JSON.parse(json), r("DegaCw721QueryResponseMessages"));
    }

    public static degaCw721QueryResponseMessagesToJson(value: DegaCw721QueryResponseMessages): string {
        return JSON.stringify(uncast(value, r("DegaCw721QueryResponseMessages")), null, 2);
    }
}

function invalidValue(typ: any, val: any, key: any, parent: any = ''): never {
    const prettyTyp = prettyTypeName(typ);
    const parentText = parent ? ` on ${parent}` : '';
    const keyText = key ? ` for key "${key}"` : '';
    throw Error(`Invalid value${keyText}${parentText}. Expected ${prettyTyp} but got ${JSON.stringify(val)}`);
}

function prettyTypeName(typ: any): string {
    if (Array.isArray(typ)) {
        if (typ.length === 2 && typ[0] === undefined) {
            return `an optional ${prettyTypeName(typ[1])}`;
        } else {
            return `one of [${typ.map(a => { return prettyTypeName(a); }).join(", ")}]`;
        }
    } else if (typeof typ === "object" && typ.literal !== undefined) {
        return typ.literal;
    } else {
        return typeof typ;
    }
}

function jsonToJSProps(typ: any): any {
    if (typ.jsonToJS === undefined) {
        const map: any = {};
        typ.props.forEach((p: any) => map[p.json] = { key: p.js, typ: p.typ });
        typ.jsonToJS = map;
    }
    return typ.jsonToJS;
}

function jsToJSONProps(typ: any): any {
    if (typ.jsToJSON === undefined) {
        const map: any = {};
        typ.props.forEach((p: any) => map[p.js] = { key: p.json, typ: p.typ });
        typ.jsToJSON = map;
    }
    return typ.jsToJSON;
}

function transform(val: any, typ: any, getProps: any, key: any = '', parent: any = ''): any {
    function transformPrimitive(typ: string, val: any): any {
        if (typeof typ === typeof val) return val;
        return invalidValue(typ, val, key, parent);
    }

    function transformUnion(typs: any[], val: any): any {
        // val must validate against one typ in typs
        const l = typs.length;
        for (let i = 0; i < l; i++) {
            const typ = typs[i];
            try {
                return transform(val, typ, getProps);
            } catch (_) {}
        }
        return invalidValue(typs, val, key, parent);
    }

    function transformEnum(cases: string[], val: any): any {
        if (cases.indexOf(val) !== -1) return val;
        return invalidValue(cases.map(a => { return l(a); }), val, key, parent);
    }

    function transformArray(typ: any, val: any): any {
        // val must be an array with no invalid elements
        if (!Array.isArray(val)) return invalidValue(l("array"), val, key, parent);
        return val.map(el => transform(el, typ, getProps));
    }

    function transformDate(val: any): any {
        if (val === null) {
            return null;
        }
        const d = new Date(val);
        if (isNaN(d.valueOf())) {
            return invalidValue(l("Date"), val, key, parent);
        }
        return d;
    }

    function transformObject(props: { [k: string]: any }, additional: any, val: any): any {
        if (val === null || typeof val !== "object" || Array.isArray(val)) {
            return invalidValue(l(ref || "object"), val, key, parent);
        }
        const result: any = {};
        Object.getOwnPropertyNames(props).forEach(key => {
            const prop = props[key];
            const v = Object.prototype.hasOwnProperty.call(val, key) ? val[key] : undefined;
            result[prop.key] = transform(v, prop.typ, getProps, key, ref);
        });
        Object.getOwnPropertyNames(val).forEach(key => {
            if (!Object.prototype.hasOwnProperty.call(props, key)) {
                result[key] = transform(val[key], additional, getProps, key, ref);
            }
        });
        return result;
    }

    if (typ === "any") return val;
    if (typ === null) {
        if (val === null) return val;
        return invalidValue(typ, val, key, parent);
    }
    if (typ === false) return invalidValue(typ, val, key, parent);
    let ref: any = undefined;
    while (typeof typ === "object" && typ.ref !== undefined) {
        ref = typ.ref;
        typ = typeMap[typ.ref];
    }
    if (Array.isArray(typ)) return transformEnum(typ, val);
    if (typeof typ === "object") {
        return typ.hasOwnProperty("unionMembers") ? transformUnion(typ.unionMembers, val)
            : typ.hasOwnProperty("arrayItems")    ? transformArray(typ.arrayItems, val)
            : typ.hasOwnProperty("props")         ? transformObject(getProps(typ), typ.additional, val)
            : invalidValue(typ, val, key, parent);
    }
    // Numbers can be parsed by Date but shouldn't be.
    if (typ === Date && typeof val !== "number") return transformDate(val);
    return transformPrimitive(typ, val);
}

function cast<T>(val: any, typ: any): T {
    return transform(val, typ, jsonToJSProps);
}

function uncast<T>(val: T, typ: any): any {
    return transform(val, typ, jsToJSONProps);
}

function l(typ: any) {
    return { literal: typ };
}

function a(typ: any) {
    return { arrayItems: typ };
}

function u(...typs: any[]) {
    return { unionMembers: typs };
}

function o(props: any[], additional: any) {
    return { props, additional };
}

function m(additional: any) {
    return { props: [], additional };
}

function r(name: string) {
    return { ref: name };
}

const typeMap: any = {
    "DegaCw721QueryResponseMessages": o([
        { json: "all_nft_info_response", js: "all_nft_info_response", typ: r("AllNftInfoResponseForNullableEmpty") },
        { json: "approval_response", js: "approval_response", typ: r("ApprovalResponse") },
        { json: "approvals_response", js: "approvals_response", typ: r("ApprovalsResponse") },
        { json: "check_royalties_response", js: "check_royalties_response", typ: r("CheckRoyaltiesResponse") },
        { json: "collection_info_response", js: "collection_info_response", typ: r("CollectionInfoResponse") },
        { json: "contract_info_response", js: "contract_info_response", typ: r("ContractInfoResponse") },
        { json: "minter_response", js: "minter_response", typ: r("MinterResponse") },
        { json: "nft_info_response", js: "nft_info_response", typ: r("NftInfoResponseForNullableEmpty") },
        { json: "num_tokens_response", js: "num_tokens_response", typ: r("NumTokensResponse") },
        { json: "operator_response", js: "operator_response", typ: r("OperatorResponse") },
        { json: "operators_response", js: "operators_response", typ: r("OperatorsResponse") },
        { json: "owner_of_response", js: "owner_of_response", typ: r("OwnerOfResponse") },
        { json: "royalty_info_response", js: "royalty_info_response", typ: r("RoyaltiesInfoResponse") },
        { json: "tokens_response", js: "tokens_response", typ: r("TokensResponse") },
    ], false),
    "AllNftInfoResponseForNullableEmpty": o([
        { json: "access", js: "access", typ: r("OwnerOfResponse") },
        { json: "info", js: "info", typ: r("NftInfoResponseForNullableEmpty") },
    ], false),
    "OwnerOfResponse": o([
        { json: "approvals", js: "approvals", typ: a(r("Approval")) },
        { json: "owner", js: "owner", typ: "" },
    ], false),
    "Approval": o([
        { json: "expires", js: "expires", typ: r("Expiration") },
        { json: "spender", js: "spender", typ: "" },
    ], false),
    "Expiration": o([
        { json: "at_height", js: "at_height", typ: u(undefined, 0) },
        { json: "at_time", js: "at_time", typ: u(undefined, "") },
        { json: "never", js: "never", typ: u(undefined, r("Never")) },
    ], false),
    "Never": o([
    ], false),
    "NftInfoResponseForNullableEmpty": o([
        { json: "extension", js: "extension", typ: u(undefined, u(m("any"), null)) },
        { json: "token_uri", js: "token_uri", typ: u(undefined, u(null, "")) },
    ], false),
    "ApprovalResponse": o([
        { json: "approval", js: "approval", typ: r("Approval") },
    ], false),
    "ApprovalsResponse": o([
        { json: "approvals", js: "approvals", typ: a(r("Approval")) },
    ], false),
    "CheckRoyaltiesResponse": o([
        { json: "royalty_payments", js: "royalty_payments", typ: true },
    ], false),
    "CollectionInfoResponse": o([
        { json: "description", js: "description", typ: "" },
        { json: "external_link", js: "external_link", typ: u(undefined, u(null, "")) },
        { json: "image", js: "image", typ: "" },
        { json: "royalty_settings", js: "royalty_settings", typ: u(undefined, u(r("RoyaltySettingsResponse"), null)) },
    ], false),
    "RoyaltySettingsResponse": o([
        { json: "payment_address", js: "payment_address", typ: "" },
        { json: "share", js: "share", typ: "" },
    ], false),
    "ContractInfoResponse": o([
        { json: "name", js: "name", typ: "" },
        { json: "symbol", js: "symbol", typ: "" },
    ], false),
    "MinterResponse": o([
        { json: "minter", js: "minter", typ: u(undefined, u(null, "")) },
    ], false),
    "NumTokensResponse": o([
        { json: "count", js: "count", typ: 0 },
    ], false),
    "OperatorResponse": o([
        { json: "approval", js: "approval", typ: r("Approval") },
    ], false),
    "OperatorsResponse": o([
        { json: "operators", js: "operators", typ: a(r("Approval")) },
    ], false),
    "RoyaltiesInfoResponse": o([
        { json: "address", js: "address", typ: "" },
        { json: "royalty_amount", js: "royalty_amount", typ: "" },
    ], false),
    "TokensResponse": o([
        { json: "tokens", js: "tokens", typ: a("") },
    ], false),
};
