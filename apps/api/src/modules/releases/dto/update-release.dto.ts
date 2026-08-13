import { PartialType } from '@nestjs/swagger';

import { CreateReleaseDto } from './create-release.dto.js';

export class UpdateReleaseDto extends PartialType(CreateReleaseDto) {}
