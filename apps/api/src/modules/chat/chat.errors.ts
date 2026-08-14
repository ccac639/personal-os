import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';

/** 统一错误语义：404 / 409 / 400 / 413 */
export function errNotFound(resource: string, id: string): NotFoundException {
  return new NotFoundException(`${resource}不存在: ${id}`);
}

export function errConflict(message: string): ConflictException {
  return new ConflictException(message);
}

export function errBadRequest(message: string): BadRequestException {
  return new BadRequestException(message);
}

export function errTooLarge(message: string): PayloadTooLargeException {
  return new PayloadTooLargeException(message);
}
