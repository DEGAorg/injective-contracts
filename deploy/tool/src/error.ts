
export type DeployErrorType = "UsageError" | "InputError" | "ScriptError" | "DecodeError"

export class DeployError {
    constructor(type : DeployErrorType, message: string) {
        this.message = message
        this.err_type = type
    }

    message: string;
    err_type: DeployErrorType;
}