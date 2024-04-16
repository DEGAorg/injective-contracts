// To parse this data:
//
//   import { Convert, DegaCw721QueryMsg } from "./file";
//
//   const degaCw721QueryMsg = Convert.toDegaCw721QueryMsg(json);
//
// These functions will throw an error if the JSON doesn't
// match the expected interface, even if the JSON is valid.

/**
 * Query the contract's ownership information
 */
export interface DegaCw721QueryMsg {
    owner_of?:        OwnerOf;
    approval?:        Approval;
    approvals?:       Approvals;
    all_operators?:   AllOperators;
    num_tokens?:      NumTokens;
    contract_info?:   ContractInfo;
    nft_info?:        NftInfo;
    all_nft_info?:    AllNftInfo;
    tokens?:          Tokens;
    all_tokens?:      AllTokens;
    minter?:          Minter;
    collection_info?: CollectionInfo;
    extension?:       Extension;
    ownership?:       Ownership;
}

export interface AllNftInfo {
    include_expired?: boolean | null;
    token_id:         string;
}

export interface AllOperators {
    include_expired?: boolean | null;
    limit?:           number | null;
    owner:            string;
    start_after?:     null | string;
}

export interface AllTokens {
    limit?:       number | null;
    start_after?: null | string;
}

export interface Approval {
    include_expired?: boolean | null;
    spender:          string;
    token_id:         string;
}

export interface Approvals {
    include_expired?: boolean | null;
    token_id:         string;
}

export interface CollectionInfo {
}

export interface ContractInfo {
}

export interface Extension {
    msg: Cw2981QueryMsg;
}

/**
 * Should be called on sale to see if royalties are owed by the marketplace selling the NFT,
 * if CheckRoyalties returns true See https://eips.ethereum.org/EIPS/eip-2981
 *
 * Called against contract to determine if this NFT implements royalties. Should return a
 * boolean as part of CheckRoyaltiesResponse - default can simply be true if royalties are
 * implemented at token level (i.e. always check on sale)
 */
export interface Cw2981QueryMsg {
    royalty_info?:    RoyaltyInfo;
    check_royalties?: CheckRoyalties;
}

export interface CheckRoyalties {
}

export interface RoyaltyInfo {
    sale_price: string;
    token_id:   string;
}

export interface Minter {
}

export interface NftInfo {
    token_id: string;
}

export interface NumTokens {
}

export interface OwnerOf {
    include_expired?: boolean | null;
    token_id:         string;
}

export interface Ownership {
}

export interface Tokens {
    limit?:       number | null;
    owner:        string;
    start_after?: null | string;
}

// Converts JSON strings to/from your types
// and asserts the results of JSON.parse at runtime
export class Convert {
    public static toDegaCw721QueryMsg(json: string): DegaCw721QueryMsg {
        return cast(JSON.parse(json), r("DegaCw721QueryMsg"));
    }

    public static degaCw721QueryMsgToJson(value: DegaCw721QueryMsg): string {
        return JSON.stringify(uncast(value, r("DegaCw721QueryMsg")), null, 2);
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
    "DegaCw721QueryMsg": o([
        { json: "owner_of", js: "owner_of", typ: u(undefined, r("OwnerOf")) },
        { json: "approval", js: "approval", typ: u(undefined, r("Approval")) },
        { json: "approvals", js: "approvals", typ: u(undefined, r("Approvals")) },
        { json: "all_operators", js: "all_operators", typ: u(undefined, r("AllOperators")) },
        { json: "num_tokens", js: "num_tokens", typ: u(undefined, r("NumTokens")) },
        { json: "contract_info", js: "contract_info", typ: u(undefined, r("ContractInfo")) },
        { json: "nft_info", js: "nft_info", typ: u(undefined, r("NftInfo")) },
        { json: "all_nft_info", js: "all_nft_info", typ: u(undefined, r("AllNftInfo")) },
        { json: "tokens", js: "tokens", typ: u(undefined, r("Tokens")) },
        { json: "all_tokens", js: "all_tokens", typ: u(undefined, r("AllTokens")) },
        { json: "minter", js: "minter", typ: u(undefined, r("Minter")) },
        { json: "collection_info", js: "collection_info", typ: u(undefined, r("CollectionInfo")) },
        { json: "extension", js: "extension", typ: u(undefined, r("Extension")) },
        { json: "ownership", js: "ownership", typ: u(undefined, r("Ownership")) },
    ], false),
    "AllNftInfo": o([
        { json: "include_expired", js: "include_expired", typ: u(undefined, u(true, null)) },
        { json: "token_id", js: "token_id", typ: "" },
    ], false),
    "AllOperators": o([
        { json: "include_expired", js: "include_expired", typ: u(undefined, u(true, null)) },
        { json: "limit", js: "limit", typ: u(undefined, u(0, null)) },
        { json: "owner", js: "owner", typ: "" },
        { json: "start_after", js: "start_after", typ: u(undefined, u(null, "")) },
    ], false),
    "AllTokens": o([
        { json: "limit", js: "limit", typ: u(undefined, u(0, null)) },
        { json: "start_after", js: "start_after", typ: u(undefined, u(null, "")) },
    ], false),
    "Approval": o([
        { json: "include_expired", js: "include_expired", typ: u(undefined, u(true, null)) },
        { json: "spender", js: "spender", typ: "" },
        { json: "token_id", js: "token_id", typ: "" },
    ], false),
    "Approvals": o([
        { json: "include_expired", js: "include_expired", typ: u(undefined, u(true, null)) },
        { json: "token_id", js: "token_id", typ: "" },
    ], false),
    "CollectionInfo": o([
    ], false),
    "ContractInfo": o([
    ], false),
    "Extension": o([
        { json: "msg", js: "msg", typ: r("Cw2981QueryMsg") },
    ], false),
    "Cw2981QueryMsg": o([
        { json: "royalty_info", js: "royalty_info", typ: u(undefined, r("RoyaltyInfo")) },
        { json: "check_royalties", js: "check_royalties", typ: u(undefined, r("CheckRoyalties")) },
    ], false),
    "CheckRoyalties": o([
    ], false),
    "RoyaltyInfo": o([
        { json: "sale_price", js: "sale_price", typ: "" },
        { json: "token_id", js: "token_id", typ: "" },
    ], false),
    "Minter": o([
    ], false),
    "NftInfo": o([
        { json: "token_id", js: "token_id", typ: "" },
    ], false),
    "NumTokens": o([
    ], false),
    "OwnerOf": o([
        { json: "include_expired", js: "include_expired", typ: u(undefined, u(true, null)) },
        { json: "token_id", js: "token_id", typ: "" },
    ], false),
    "Ownership": o([
    ], false),
    "Tokens": o([
        { json: "limit", js: "limit", typ: u(undefined, u(0, null)) },
        { json: "owner", js: "owner", typ: "" },
        { json: "start_after", js: "start_after", typ: u(undefined, u(null, "")) },
    ], false),
};
