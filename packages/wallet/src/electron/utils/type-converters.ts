/**
 * @fileoverview Type-safe conversion utilities for Electron IPC
 * 
 * Provides branded type converters and error boundary handlers for
 * seamless type conversion between IPC boundaries and internal types.
 */

import { IPCTypeConverter, type IPCError, type IpcResponse } from '../types/ipc-types.js';

// Re-export IPCTypeConverter for external use
export { IPCTypeConverter };

/**
 * Branded type for validated IPC addresses
 */
export type ValidatedIPCAddress = string & { readonly __brand: 'ValidatedIPCAddress' };

/**
 * Branded type for validated IPC bigints
 */
export type ValidatedIPCBigInt = number & { readonly __brand: 'ValidatedIPCBigInt' };

/**
 * Conversion result with error handling
 */
export type ConversionResult<T> = 
  | { success: true; value: T }
  | { success: false; error: IPCError };

/**
 * Enhanced type converter with branded types and error boundaries
 */
export class BrandedIPCConverter {
  /**
   * Convert and validate TariAddress to branded IPC string
   */
  static convertAddressToIPC(address: any): ConversionResult<ValidatedIPCAddress> {
    try {
      const stringAddress = IPCTypeConverter.addressToString(address);
      const validated = IPCTypeConverter.validateAddressString(stringAddress);
      return {
        success: true,
        value: validated as ValidatedIPCAddress,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "ConversionError",
          field: "address",
          expectedType: "TariAddress",
          receivedType: typeof address,
        },
      };
    }
  }

  /**
   * Convert and validate bigint to branded IPC number
   */
  static convertBigintToIPC(value: bigint): ConversionResult<ValidatedIPCBigInt> {
    try {
      const numberValue = IPCTypeConverter.bigintToNumber(value);
      return {
        success: true,
        value: numberValue as ValidatedIPCBigInt,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "ConversionError",
          field: "bigint",
          expectedType: "bigint",
          receivedType: typeof value,
        },
      };
    }
  }

  /**
   * Convert IPC number back to bigint
   */
  static convertIPCToBigint(value: number): ConversionResult<bigint> {
    try {
      const bigintValue = IPCTypeConverter.numberToBigint(value);
      return {
        success: true,
        value: bigintValue,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "ConversionError",
          field: "number",
          expectedType: "safe integer",
          receivedType: typeof value,
        },
      };
    }
  }
}

/**
 * Error boundary wrapper for IPC handlers
 */
export class IPCErrorBoundary {
  /**
   * Wrap an IPC handler with automatic error conversion
   */
  static wrapHandler<TReq, TRes>(
    handler: (request: TReq) => Promise<TRes>
  ): (request: TReq) => Promise<IpcResponse<TRes>> {
    return async (request: TReq): Promise<IpcResponse<TRes>> => {
      try {
        const result = await handler(request);
        return IPCTypeConverter.createSuccessResponse(result);
      } catch (error) {
        const ipcError = IPCTypeConverter.handleUnknownError(error, 'IPC handler');
        return IPCTypeConverter.createErrorResponse(ipcError);
      }
    };
  }

  /**
   * Wrap an IPC handler with type conversion for addresses
   */
  static wrapAddressHandler<TReq, TRes>(
    handler: (request: TReq) => Promise<TRes>,
    addressConverter: (result: TRes) => any
  ): (request: TReq) => Promise<IpcResponse<ValidatedIPCAddress>> {
    return async (request: TReq): Promise<IpcResponse<ValidatedIPCAddress>> => {
      try {
        const result = await handler(request);
        const address = addressConverter(result);
        const conversion = BrandedIPCConverter.convertAddressToIPC(address);
        
        if (!conversion.success) {
          return IPCTypeConverter.createErrorResponse(conversion.error);
        }
        
        return IPCTypeConverter.createSuccessResponse(conversion.value);
      } catch (error) {
        const ipcError = IPCTypeConverter.handleUnknownError(error, 'Address IPC handler');
        return IPCTypeConverter.createErrorResponse(ipcError);
      }
    };
  }

  /**
   * Wrap an IPC handler with type conversion for bigints
   */
  static wrapBigintHandler<TReq, TRes>(
    handler: (request: TReq) => Promise<TRes>,
    bigintConverter: (result: TRes) => bigint
  ): (request: TReq) => Promise<IpcResponse<ValidatedIPCBigInt>> {
    return async (request: TReq): Promise<IpcResponse<ValidatedIPCBigInt>> => {
      try {
        const result = await handler(request);
        const bigintValue = bigintConverter(result);
        const conversion = BrandedIPCConverter.convertBigintToIPC(bigintValue);
        
        if (!conversion.success) {
          return IPCTypeConverter.createErrorResponse(conversion.error);
        }
        
        return IPCTypeConverter.createSuccessResponse(conversion.value);
      } catch (error) {
        const ipcError = IPCTypeConverter.handleUnknownError(error, 'Bigint IPC handler');
        return IPCTypeConverter.createErrorResponse(ipcError);
      }
    };
  }
}

/**
 * Utility functions for common IPC operations
 */
export class IPCUtilities {
  /**
   * Create a response helper that includes consistent timestamp and request ID
   */
  static createResponseHelper(requestId?: string) {
    return {
      success<T>(data: T): IpcResponse<T> {
        return IPCTypeConverter.createSuccessResponse(data, requestId);
      },
      
      error(error: IPCError | string): IpcResponse<never> {
        const ipcError = typeof error === 'string' 
          ? { code: "UnknownError" as const, cause: error }
          : error;
        return IPCTypeConverter.createErrorResponse(ipcError, requestId);
      },
    };
  }

  /**
   * Validate request structure
   */
  static validateRequest<T>(
    request: unknown,
    requiredFields: (keyof T)[]
  ): ConversionResult<T> {
    if (!request || typeof request !== 'object') {
      return {
        success: false,
        error: {
          code: "ValidationError",
          detail: "Request must be an object",
        },
      };
    }

    const req = request as Record<string, unknown>;
    
    for (const field of requiredFields) {
      if (!(field in req) || req[field as string] === undefined) {
        return {
          success: false,
          error: {
            code: "ValidationError",
            detail: `Missing required field: ${String(field)}`,
          },
        };
      }
    }

    return {
      success: true,
      value: request as T,
    };
  }
}
