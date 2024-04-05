// To parse this data:
//
//   import { Convert, DegaMinterInstantiateMsg } from "./file";
//
//   const degaMinterInstantiateMsg = Convert.toDegaMinterInstantiateMsg(json);
//
// These functions will throw an error if the JSON doesn't
// match the expected interface, even if the JSON is valid.

export interface DegaMinterInstantiateMsg {
    collection_params: CollectionParams;
    init_msg:          CreateMinterInitMsgForNullableEmptyAndNullableEmpty;
}

export interface CollectionParams {
    /**
     * The collection code id
     */
    code_id: number;
    info:    CollectionInfoForRoyaltyInfoResponse;
    name:    string;
    symbol:  string;
}

export interface CollectionInfoForRoyaltyInfoResponse {
    creator:             string;
    description:         string;
    explicit_content?:   boolean | null;
    external_link?:      null | string;
    image:               string;
    royalty_info?:       RoyaltyInfoResponse | null;
    start_trading_time?: null | string;
}

export interface RoyaltyInfoResponse {
    payment_address: string;
    share:           string;
}

export interface CreateMinterInitMsgForNullableEmptyAndNullableEmpty {
    params:              MinterParamsForNullableEmpty;
    remaining_init_msg?: { [key: string]: any } | null;
}

/**
 * Common params for all minters used for storage
 */
export interface MinterParamsForNullableEmpty {
    /**
     * The minter code id
     */
    allowed_sg721_code_ids:  number[];
    creation_fee:            Coin;
    extension?:              { [key: string]: any } | null;
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

// Converts JSON strings to/from your types
// and asserts the results of JSON.parse at runtime
export class Convert {
    public static toDegaMinterInstantiateMsg(json: string): DegaMinterInstantiateMsg {
        return cast(JSON.parse(json), r("DegaMinterInstantiateMsg"));
    }

    public static degaMinterInstantiateMsgToJson(value: DegaMinterInstantiateMsg): string {
        return JSON.stringify(uncast(value, r("DegaMinterInstantiateMsg")), null, 2);
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
    "DegaMinterInstantiateMsg": o([
        { json: "collection_params", js: "collection_params", typ: r("CollectionParams") },
        { json: "init_msg", js: "init_msg", typ: r("CreateMinterInitMsgForNullableEmptyAndNullableEmpty") },
    ], false),
    "CollectionParams": o([
        { json: "code_id", js: "code_id", typ: 0 },
        { json: "info", js: "info", typ: r("CollectionInfoForRoyaltyInfoResponse") },
        { json: "name", js: "name", typ: "" },
        { json: "symbol", js: "symbol", typ: "" },
    ], false),
    "CollectionInfoForRoyaltyInfoResponse": o([
        { json: "creator", js: "creator", typ: "" },
        { json: "description", js: "description", typ: "" },
        { json: "explicit_content", js: "explicit_content", typ: u(undefined, u(true, null)) },
        { json: "external_link", js: "external_link", typ: u(undefined, u(null, "")) },
        { json: "image", js: "image", typ: "" },
        { json: "royalty_info", js: "royalty_info", typ: u(undefined, u(r("RoyaltyInfoResponse"), null)) },
        { json: "start_trading_time", js: "start_trading_time", typ: u(undefined, u(null, "")) },
    ], false),
    "RoyaltyInfoResponse": o([
        { json: "payment_address", js: "payment_address", typ: "" },
        { json: "share", js: "share", typ: "" },
    ], false),
    "CreateMinterInitMsgForNullableEmptyAndNullableEmpty": o([
        { json: "params", js: "params", typ: r("MinterParamsForNullableEmpty") },
        { json: "remaining_init_msg", js: "remaining_init_msg", typ: u(undefined, u(m("any"), null)) },
    ], false),
    "MinterParamsForNullableEmpty": o([
        { json: "allowed_sg721_code_ids", js: "allowed_sg721_code_ids", typ: a(0) },
        { json: "creation_fee", js: "creation_fee", typ: r("Coin") },
        { json: "extension", js: "extension", typ: u(undefined, u(m("any"), null)) },
        { json: "frozen", js: "frozen", typ: true },
        { json: "max_trading_offset_secs", js: "max_trading_offset_secs", typ: 0 },
        { json: "min_mint_price", js: "min_mint_price", typ: r("Coin") },
        { json: "mint_fee_bps", js: "mint_fee_bps", typ: 0 },
    ], false),
    "Coin": o([
        { json: "amount", js: "amount", typ: "" },
        { json: "denom", js: "denom", typ: "" },
    ], "any"),
};