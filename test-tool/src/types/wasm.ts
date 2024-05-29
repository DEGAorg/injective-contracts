export type WasmError = {
  originalMessage: string;
  message: string;
  stack: string;
  name: string;
  fileName: string;
  lineNumber: number;
  columnNumber: number;
  error: any;
};