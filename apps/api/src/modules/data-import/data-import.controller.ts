import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { DataImportService } from './data-import.service.js';
import { type ImportResult, ImportDataDto } from './data-import.dto.js';

@ApiTags('data-import')
@Controller('data')
export class DataImportController {
  constructor(private readonly dataImportService: DataImportService) {}

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '从 localStorage 导出数据导入',
    description:
      '校验版本（v1）、数量上限、集合内重复 ID、引用完整性（项目/任务依赖/里程碑/发布/知识/focus），' +
      '全部通过后按导入 id 幂等 upsert（可重复导入）。引用必须自包含于导入数据内。',
  })
  importData(@Body() dto: ImportDataDto): Promise<ImportResult> {
    return this.dataImportService.importData(dto);
  }
}
