import { WasmError } from "../types/wasm";

export const compareWasmError = (message: string, error: WasmError) =>{
  return error.originalMessage.includes(message);
}