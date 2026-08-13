import { PartialType } from '@nestjs/swagger';

import { CreateMilestoneDto } from './create-milestone.dto.js';

export class UpdateMilestoneDto extends PartialType(CreateMilestoneDto) {}
