import { PartialType } from '@nestjs/swagger';

import { CreateKnowledgeDto } from './create-knowledge.dto.js';

export class UpdateKnowledgeDto extends PartialType(CreateKnowledgeDto) {}
