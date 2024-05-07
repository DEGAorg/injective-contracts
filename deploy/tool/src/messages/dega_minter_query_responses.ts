// To parse this data:
//
//   import { Convert, DegaMinterQueryResponseMessages } from "./file";
//
//   const degaMinterQueryResponseMessages = Convert.toDegaMinterQueryResponseMessages(json);
//
// These functions will throw an error if the JSON doesn't
// match the expected interface, even if the JSON is valid.

export interface DegaMinterQueryResponseMessages {
    admins_response:             AdminsResponse;
    check_sig_response:          CheckSigResponse;
    dega_minter_config_response: DegaMinterConfigResponse;
    status_response:             StatusResponse;
}

export interface AdminsResponse {
    admins: string[];
}

export interface CheckSigResponse {
    error?:            null | string;
    is_valid:          boolean;
    message_hash_hex:  string;
    verifying_key_len: number;
}

export interface DegaMinterConfigResponse {
    base_minter_config:   MinterConfigForMinterParamsForEmpty;
    collection_address:   string;
    dega_minter_settings: DegaMinterConfigSettings;
}

/**
 * Saved in every minter
 */
export interface MinterConfigForMinterParamsForEmpty {
    collection_code_id: number;
    extension:          MinterParamsForEmpty;
    mint_price:         Coin;
}

/**
 * Common params for all minters used for storage
 */
export interface MinterParamsForEmpty {
    creation_fee: Coin;
    extension:    { [key: string]: any };
    /**
     * The minter code id
     */
    frozen:                  boolean;
    max_trading_offset_secs: number;
    min_mint_price:          Coin;
    mint_fee_bps:            number;
}

export interface Coin {
    amount: string;
    denom:  string;
    [property: string]: any;
}

export interface DegaMinterConfigSettings {
    minting_paused: boolean;
    signer_pub_key: string;
}

export interface StatusResponse {
    status: Status;
}

export interface Status {
    is_blocked:  boolean;
    is_explicit: boolean;
    is_verified: boolean;
}

// Converts JSON strings to/from your types
// and asserts the results of JSON.parse at runtime
export class Convert {
    public static toDegaMinterQueryResponseMessages(json: string): DegaMinterQueryResponseMessages {
        return cast(JSON.parse(json), r("DegaMinterQueryResponseMessages"));
    }

    public static degaMinterQueryResponseMessagesToJson(value: DegaMinterQueryResponseMessages): string {
        return JSON.stringify(uncast(value, r("DegaMinterQueryResponseMessages")), null, 2);
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
    "DegaMinterQueryResponseMessages": o([
        { json: "admins_response", js: "admins_response", typ: r("AdminsResponse") },
        { json: "check_sig_response", js: "check_sig_response", typ: r("CheckSigResponse") },
        { json: "dega_minter_config_response", js: "dega_minter_config_response", typ: r("DegaMinterConfigResponse") },
        { json: "status_response", js: "status_response", typ: r("StatusResponse") },
    ], false),
    "AdminsResponse": o([
        { json: "admins", js: "admins", typ: a("") },
    ], false),
    "CheckSigResponse": o([
        { json: "error", js: "error", typ: u(undefined, u(null, "")) },
        { json: "is_valid", js: "is_valid", typ: true },
        { json: "message_hash_hex", js: "message_hash_hex", typ: "" },
        { json: "verifying_key_len", js: "verifying_key_len", typ: 0 },
    ], false),
    "DegaMinterConfigResponse": o([
        { json: "base_minter_config", js: "base_minter_config", typ: r("MinterConfigForMinterParamsForEmpty") },
        { json: "collection_address", js: "collection_address", typ: "" },
        { json: "dega_minter_settings", js: "dega_minter_settings", typ: r("DegaMinterConfigSettings") },
    ], false),
    "MinterConfigForMinterParamsForEmpty": o([
        { json: "collection_code_id", js: "collection_code_id", typ: 0 },
        { json: "extension", js: "extension", typ: r("MinterParamsForEmpty") },
        { json: "mint_price", js: "mint_price", typ: r("Coin") },
    ], false),
    "MinterParamsForEmpty": o([
        { json: "creation_fee", js: "creation_fee", typ: r("Coin") },
        { json: "extension", js: "extension", typ: m("any") },
        { json: "frozen", js: "frozen", typ: true },
        { json: "max_trading_offset_secs", js: "max_trading_offset_secs", typ: 0 },
        { json: "min_mint_price", js: "min_mint_price", typ: r("Coin") },
        { json: "mint_fee_bps", js: "mint_fee_bps", typ: 0 },
    ], false),
    "Coin": o([
        { json: "amount", js: "amount", typ: "" },
        { json: "denom", js: "denom", typ: "" },
    ], "any"),
    "DegaMinterConfigSettings": o([
        { json: "minting_paused", js: "minting_paused", typ: true },
        { json: "signer_pub_key", js: "signer_pub_key", typ: "" },
    ], false),
    "StatusResponse": o([
        { json: "status", js: "status", typ: r("Status") },
    ], false),
    "Status": o([
        { json: "is_blocked", js: "is_blocked", typ: true },
        { json: "is_explicit", js: "is_explicit", typ: true },
        { json: "is_verified", js: "is_verified", typ: true },
    ], false),
};
