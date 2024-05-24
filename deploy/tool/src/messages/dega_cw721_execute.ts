// To parse this data:
//
//   import { Convert, DegaCw721ExecuteMsg } from "./file";
//
//   const degaCw721ExecuteMsg = Convert.toDegaCw721ExecuteMsg(json);
//
// These functions will throw an error if the JSON doesn't
// match the expected interface, even if the JSON is valid.

/**
 * Transfer is a base message to move a token to another account without triggering actions
 *
 * Send is a base message to transfer a token to a contract and trigger an action on the
 * receiving contract.
 *
 * Allows operator to transfer / send the token from the owner's account. If expiration is
 * set, then this allowance has a time/height limit
 *
 * Remove previously granted Approval
 *
 * Allows operator to transfer / send any token from the owner's account. If expiration is
 * set, then this allowance has a time/height limit
 *
 * Remove previously granted ApproveAll permission
 *
 * Mint a new NFT, can only be called by the contract minter
 *
 * Burn an NFT the sender has access to
 *
 * Extension msg
 *
 * Update the contract's ownership. The `action` to be provided can be either to propose
 * transferring ownership to an account, accept a pending ownership transfer, or renounce
 * the ownership permanently.
 */
export interface DegaCw721ExecuteMsg {
    transfer_nft?:           TransferNft;
    send_nft?:               SendNft;
    approve?:                Approve;
    revoke?:                 Revoke;
    approve_all?:            ApproveAll;
    revoke_all?:             RevokeAll;
    mint?:                   Mint;
    burn?:                   Burn;
    extension?:              Extension;
    update_collection_info?: UpdateCollectionInfo;
    update_ownership?:       ActionClass | ActionEnum;
}

export interface Approve {
    expires?: Expiration | null;
    spender:  string;
    token_id: string;
}

/**
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

export interface ApproveAll {
    expires?: Expiration | null;
    operator: string;
}

export interface Burn {
    token_id: string;
}

export interface Extension {
    msg: { [key: string]: any };
}

export interface Mint {
    /**
     * Any custom extension used by this contract
     */
    extension?: { [key: string]: any } | null;
    /**
     * The owner of the newly minter NFT
     */
    owner: string;
    /**
     * Unique ID of the NFT
     */
    token_id: string;
    /**
     * Universal resource identifier for this NFT Should point to a JSON file that conforms to
     * the ERC721 Metadata JSON Schema
     */
    token_uri?: null | string;
}

export interface Revoke {
    spender:  string;
    token_id: string;
}

export interface RevokeAll {
    operator: string;
}

export interface SendNft {
    contract: string;
    msg:      string;
    token_id: string;
}

export interface TransferNft {
    recipient: string;
    token_id:  string;
}

export interface UpdateCollectionInfo {
    collection_info: UpdateCollectionInfoMsgForRoyaltyInfoResponse;
}

export interface UpdateCollectionInfoMsgForRoyaltyInfoResponse {
    creator?:          null | string;
    description?:      null | string;
    explicit_content?: boolean | null;
    external_link?:    null | string;
    image?:            null | string;
    royalty_info?:     RoyaltyInfoResponse | null;
}

export interface RoyaltyInfoResponse {
    payment_address: string;
    share:           string;
}

/**
 * Propose to transfer the contract's ownership to another account, optionally with an
 * expiry time.
 *
 * Can only be called by the contract's current owner.
 *
 * Any existing pending ownership transfer is overwritten.
 */
export interface ActionClass {
    transfer_ownership: TransferOwnership;
}

export interface TransferOwnership {
    expiry?:   Expiration | null;
    new_owner: string;
}

/**
 * Accept the pending ownership transfer.
 *
 * Can only be called by the pending owner.
 *
 * Give up the contract's ownership and the possibility of appointing a new owner.
 *
 * Can only be invoked by the contract's current owner.
 *
 * Any existing pending ownership transfer is canceled.
 */
export enum ActionEnum {
    AcceptOwnership = "accept_ownership",
    RenounceOwnership = "renounce_ownership",
}

// Converts JSON strings to/from your types
// and asserts the results of JSON.parse at runtime
export class Convert {
    public static toDegaCw721ExecuteMsg(json: string): DegaCw721ExecuteMsg {
        return cast(JSON.parse(json), r("DegaCw721ExecuteMsg"));
    }

    public static degaCw721ExecuteMsgToJson(value: DegaCw721ExecuteMsg): string {
        return JSON.stringify(uncast(value, r("DegaCw721ExecuteMsg")), null, 2);
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
    "DegaCw721ExecuteMsg": o([
        { json: "transfer_nft", js: "transfer_nft", typ: u(undefined, r("TransferNft")) },
        { json: "send_nft", js: "send_nft", typ: u(undefined, r("SendNft")) },
        { json: "approve", js: "approve", typ: u(undefined, r("Approve")) },
        { json: "revoke", js: "revoke", typ: u(undefined, r("Revoke")) },
        { json: "approve_all", js: "approve_all", typ: u(undefined, r("ApproveAll")) },
        { json: "revoke_all", js: "revoke_all", typ: u(undefined, r("RevokeAll")) },
        { json: "mint", js: "mint", typ: u(undefined, r("Mint")) },
        { json: "burn", js: "burn", typ: u(undefined, r("Burn")) },
        { json: "extension", js: "extension", typ: u(undefined, r("Extension")) },
        { json: "update_collection_info", js: "update_collection_info", typ: u(undefined, r("UpdateCollectionInfo")) },
        { json: "update_ownership", js: "update_ownership", typ: u(undefined, u(r("ActionClass"), r("ActionEnum"))) },
    ], false),
    "Approve": o([
        { json: "expires", js: "expires", typ: u(undefined, u(r("Expiration"), null)) },
        { json: "spender", js: "spender", typ: "" },
        { json: "token_id", js: "token_id", typ: "" },
    ], false),
    "Expiration": o([
        { json: "at_height", js: "at_height", typ: u(undefined, 0) },
        { json: "at_time", js: "at_time", typ: u(undefined, "") },
        { json: "never", js: "never", typ: u(undefined, r("Never")) },
    ], false),
    "Never": o([
    ], false),
    "ApproveAll": o([
        { json: "expires", js: "expires", typ: u(undefined, u(r("Expiration"), null)) },
        { json: "operator", js: "operator", typ: "" },
    ], false),
    "Burn": o([
        { json: "token_id", js: "token_id", typ: "" },
    ], false),
    "Extension": o([
        { json: "msg", js: "msg", typ: m("any") },
    ], false),
    "Mint": o([
        { json: "extension", js: "extension", typ: u(undefined, u(m("any"), null)) },
        { json: "owner", js: "owner", typ: "" },
        { json: "token_id", js: "token_id", typ: "" },
        { json: "token_uri", js: "token_uri", typ: u(undefined, u(null, "")) },
    ], false),
    "Revoke": o([
        { json: "spender", js: "spender", typ: "" },
        { json: "token_id", js: "token_id", typ: "" },
    ], false),
    "RevokeAll": o([
        { json: "operator", js: "operator", typ: "" },
    ], false),
    "SendNft": o([
        { json: "contract", js: "contract", typ: "" },
        { json: "msg", js: "msg", typ: "" },
        { json: "token_id", js: "token_id", typ: "" },
    ], false),
    "TransferNft": o([
        { json: "recipient", js: "recipient", typ: "" },
        { json: "token_id", js: "token_id", typ: "" },
    ], false),
    "UpdateCollectionInfo": o([
        { json: "collection_info", js: "collection_info", typ: r("UpdateCollectionInfoMsgForRoyaltyInfoResponse") },
    ], false),
    "UpdateCollectionInfoMsgForRoyaltyInfoResponse": o([
        { json: "creator", js: "creator", typ: u(undefined, u(null, "")) },
        { json: "description", js: "description", typ: u(undefined, u(null, "")) },
        { json: "explicit_content", js: "explicit_content", typ: u(undefined, u(true, null)) },
        { json: "external_link", js: "external_link", typ: u(undefined, u(null, "")) },
        { json: "image", js: "image", typ: u(undefined, u(null, "")) },
        { json: "royalty_info", js: "royalty_info", typ: u(undefined, u(r("RoyaltyInfoResponse"), null)) },
    ], false),
    "RoyaltyInfoResponse": o([
        { json: "payment_address", js: "payment_address", typ: "" },
        { json: "share", js: "share", typ: "" },
    ], false),
    "ActionClass": o([
        { json: "transfer_ownership", js: "transfer_ownership", typ: r("TransferOwnership") },
    ], false),
    "TransferOwnership": o([
        { json: "expiry", js: "expiry", typ: u(undefined, u(r("Expiration"), null)) },
        { json: "new_owner", js: "new_owner", typ: "" },
    ], false),
    "ActionEnum": [
        "accept_ownership",
        "renounce_ownership",
    ],
};
