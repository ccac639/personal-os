import { PartialType } from '@nestjs/swagger';

import { CreateProjectDto } from './create-project.dto.js';

export class UpdateProjectDto extends PartialType(CreateProjectDto) {}
