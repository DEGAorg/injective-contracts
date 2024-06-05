
type DeployErrorType = "InputError" | "ScriptError" | "DecodeError"

class DeployError {
    constructor(type : DeployErrorType, message: string) {
        this.message = message
    }

    message: string
}