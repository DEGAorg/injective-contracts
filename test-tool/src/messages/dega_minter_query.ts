// To parse this data:
//
//   import { Convert, DegaMinterQueryMsg } from "./file";
//
//   const degaMinterQueryMsg = Convert.toDegaMinterQueryMsg(json);
//
// These functions will throw an error if the JSON doesn't
// match the expected interface, even if the JSON is valid.

/**
 * Returns `DegaMinterConfigResponse`
 *
 * Returns `StatusResponse`
 */
export interface DegaMinterQueryMsg {
    config?:    Config;
    status?:    Status;
    check_sig?: CheckSig;
}

export interface CheckSig {
    message:       VerifiableMsg;
    signature:     string;
    signer_source: SignerSourceTypeClass | SignerSourceTypeEnum;
}

export interface VerifiableMsg {
    string?:       string;
    mint_request?: MintRequest;
}

export interface MintRequest {
    currency:                 string;
    price:                    string;
    primary_sale_recipient:   string;
    royalty_bps:              string;
    royalty_recipient:        string;
    to:                       string;
    uid:                      number;
    uri:                      string;
    validity_end_timestamp:   string;
    validity_start_timestamp: string;
}

export interface SignerSourceTypeClass {
    pub_key_binary: string;
}

export enum SignerSourceTypeEnum {
    ConfigSignerPubKey = "config_signer_pub_key",
}

export interface Config {
}

export interface Status {
}

// Converts JSON strings to/from your types
// and asserts the results of JSON.parse at runtime
export class Convert {
    public static toDegaMinterQueryMsg(json: string): DegaMinterQueryMsg {
        return cast(JSON.parse(json), r("DegaMinterQueryMsg"));
    }

    public static degaMinterQueryMsgToJson(value: DegaMinterQueryMsg): string {
        return JSON.stringify(uncast(value, r("DegaMinterQueryMsg")), null, 2);
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
    "DegaMinterQueryMsg": o([
        { json: "config", js: "config", typ: u(undefined, r("Config")) },
        { json: "status", js: "status", typ: u(undefined, r("Status")) },
        { json: "check_sig", js: "check_sig", typ: u(undefined, r("CheckSig")) },
    ], false),
    "CheckSig": o([
        { json: "message", js: "message", typ: r("VerifiableMsg") },
        { json: "signature", js: "signature", typ: "" },
        { json: "signer_source", js: "signer_source", typ: u(r("SignerSourceTypeClass"), r("SignerSourceTypeEnum")) },
    ], false),
    "VerifiableMsg": o([
        { json: "string", js: "string", typ: u(undefined, "") },
        { json: "mint_request", js: "mint_request", typ: u(undefined, r("MintRequest")) },
    ], false),
    "MintRequest": o([
        { json: "currency", js: "currency", typ: "" },
        { json: "price", js: "price", typ: "" },
        { json: "primary_sale_recipient", js: "primary_sale_recipient", typ: "" },
        { json: "royalty_bps", js: "royalty_bps", typ: "" },
        { json: "royalty_recipient", js: "royalty_recipient", typ: "" },
        { json: "to", js: "to", typ: "" },
        { json: "uid", js: "uid", typ: 0 },
        { json: "uri", js: "uri", typ: "" },
        { json: "validity_end_timestamp", js: "validity_end_timestamp", typ: "" },
        { json: "validity_start_timestamp", js: "validity_start_timestamp", typ: "" },
    ], false),
    "SignerSourceTypeClass": o([
        { json: "pub_key_binary", js: "pub_key_binary", typ: "" },
    ], false),
    "Config": o([
    ], false),
    "Status": o([
    ], false),
    "SignerSourceTypeEnum": [
        "config_signer_pub_key",
    ],
};
