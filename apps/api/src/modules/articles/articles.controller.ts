import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Cacheable } from '../../common/cache/cacheable.decorator.js';
import { ArticleListQueryDto } from './dto/article-query.dto.js';
import { ArticlesService } from './articles.service.js';

/**
 * articles 模块路由（只读镜像 Blog 内容层）。
 *
 * 定位：供未来 API 支撑博客或前端聚合读取文章内容，不写库。
 * 所有响应经平台 TransformInterceptor 统一包装为 {code,message,data} 信封；
 * 未知 slug 由服务返回 null 并在 controller 映射为 404。
 */
@ApiTags('articles')
@Controller('articles')
export class ArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  @Get()
  @Cacheable(60_000)
  @ApiOperation({ summary: '文章列表（分页，按 date 倒序，draft 排除）' })
  list(@Query() query: ArticleListQueryDto) {
    return this.articles.list({ page: query.page, pageSize: query.pageSize });
  }

  @Get('tags')
  @Cacheable(60_000)
  @ApiOperation({ summary: '标签聚合（含文章数，draft 排除）' })
  listTags() {
    return this.articles.listTags();
  }

  @Get('categories')
  @Cacheable(60_000)
  @ApiOperation({ summary: '分类聚合（含文章数，draft 排除）' })
  listCategories() {
    return this.articles.listCategories();
  }

  @Get('by-tag/:tag')
  @Cacheable(60_000)
  @ApiOperation({ summary: '按标签筛选文章列表' })
  listByTag(@Param('tag') tag: string) {
    return this.articles.listPostsByTag(tag);
  }

  @Get('by-category/:category')
  @Cacheable(60_000)
  @ApiOperation({ summary: '按分类筛选文章列表' })
  listByCategory(@Param('category') category: string) {
    return this.articles.listPostsByCategory(category);
  }

  @Get(':slug')
  @Cacheable(300_000)
  @ApiOperation({ summary: '文章详情（含正文与相邻导航；未知 slug 返回 404）' })
  getDetail(@Param('slug') slug: string) {
    const detail = this.articles.getDetail(slug);
    if (!detail) {
      throw new NotFoundException(`文章 ${slug} 不存在`);
    }
    return detail;
  }
}
