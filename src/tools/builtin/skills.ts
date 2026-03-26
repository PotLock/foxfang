/**
 * Skills management tools
 */

import { existsSync, mkdirSync, rmSync, writeFileSync, cpSync } from 'fs';
import { join, resolve } from 'path';
import {
  loadAvailableSkills,
  resolveBundledSkillsDir,
  resolveFoxFangHomePath,
  resolveManagedSkillsDir,
  sanitizeSkillSlug,
  seedManagedSkills,
} from '../../skill-system';
import { Tool, ToolCategory, ToolResult } from '../traits';

type SkillTarget = 'managed';

function resolveTargetSkillsDir(target: SkillTarget, homeDir: string): string {
  return resolveManagedSkillsDir(homeDir);
}

function buildSkillMarkdown(params: {
  name: string;
  description?: string;
  instructions?: string;
}): string {
  const description = params.description?.trim() || `Custom skill for ${params.name}.`;
  const instructions = params.instructions?.trim()
    || 'Define concrete steps the agent should execute when this skill is selected.';

  return `# ${params.name}

${description}

## When to Use This Skill

- Use when the user request clearly matches ${params.name}.

## Instructions

${instructions}
`;
}

export class SkillsListTool implements Tool {
  name = 'skills_list';
  description = 'List available skills loaded from bundled and managed locations.';
  category = ToolCategory.UTILITY;
  parameters = {
    type: 'object' as const,
    properties: {
      source: {
        type: 'string',
        description: 'Optional source filter: bundled | managed',
      },
      include_content: {
        type: 'boolean',
        description: 'Include truncated SKILL.md content previews',
      },
    },
    required: [],
  };

  async execute(args: { source?: string; include_content?: boolean }): Promise<ToolResult> {
    try {
      const homeDir = resolveFoxFangHomePath();
      seedManagedSkills(homeDir);

      const sourceFilter = args.source?.trim().toLowerCase();
      const allowed = new Set(['bundled', 'managed']);
      if (sourceFilter && !allowed.has(sourceFilter)) {
        return {
          success: false,
          error: 'Invalid source filter. Use: bundled or managed.',
        };
      }

      const skills = loadAvailableSkills({
        homeDir,
        includeContent: args.include_content === true,
      }).filter((skill) => {
        if (!sourceFilter) {
          return true;
        }
        return skill.source === sourceFilter;
      });

      return {
        success: true,
        output: `Found ${skills.length} skill(s).`,
        data: {
          count: skills.length,
          skills: skills.map((skill) => ({
            id: skill.id,
            name: skill.name,
            description: skill.description,
            source: skill.source,
            location: skill.filePath,
            ...(skill.content ? { content_preview: skill.content } : {}),
          })),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export class SkillsAddTool implements Tool {
  name = 'skills_add';
  description = 'Create a new skill or install/copy an existing bundled skill into FoxFang skills.';
  category = ToolCategory.UTILITY;
  parameters = {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description: 'Skill display name (required when creating new skill content).',
      },
      description: {
        type: 'string',
        description: 'Short skill description.',
      },
      instructions: {
        type: 'string',
        description: 'Main instructions for the skill.',
      },
      content: {
        type: 'string',
        description: 'Full SKILL.md content. If set, this is used directly.',
      },
      source_skill: {
        type: 'string',
        description: 'Optional bundled skill id/name to copy (e.g. seo-specialist).',
      },
      slug: {
        type: 'string',
        description: 'Optional folder slug for the new skill.',
      },
      target: {
        type: 'string',
        description: 'Target location: managed (default).',
      },
      overwrite: {
        type: 'boolean',
        description: 'Overwrite existing target skill folder if it already exists.',
      },
    },
    required: [],
  };

  async execute(args: {
    name?: string;
    description?: string;
    instructions?: string;
    content?: string;
    source_skill?: string;
    slug?: string;
    target?: string;
    overwrite?: boolean;
  }): Promise<ToolResult> {
    try {
      const homeDir = resolveFoxFangHomePath();
      const target: SkillTarget = 'managed';
      const targetSkillsRoot = resolveTargetSkillsDir(target, homeDir);
      mkdirSync(targetSkillsRoot, { recursive: true });

      const overwrite = args.overwrite === true;

      if (args.source_skill?.trim()) {
        const bundledDir = resolveBundledSkillsDir();
        if (!bundledDir) {
          return {
            success: false,
            error: 'Bundled skills directory not found.',
          };
        }

        const bundledSkills = loadAvailableSkills({ homeDir }).filter((skill) => skill.source === 'bundled');
        const wanted = args.source_skill.trim().toLowerCase();
        const sourceSkill = bundledSkills.find((skill) =>
          skill.id.toLowerCase() === wanted || skill.name.toLowerCase() === wanted,
        );
        if (!sourceSkill) {
          return {
            success: false,
            error: `Bundled skill not found: ${args.source_skill}`,
          };
        }

        const targetSlug = sanitizeSkillSlug(args.slug || sourceSkill.id || sourceSkill.name);
        const targetDir = resolve(join(targetSkillsRoot, targetSlug));
        if (!targetDir.startsWith(resolve(targetSkillsRoot))) {
          return {
            success: false,
            error: 'Invalid target path.',
          };
        }

        if (existsSync(targetDir)) {
          if (!overwrite) {
            return {
              success: false,
              error: `Skill already exists at ${targetDir}. Set overwrite=true to replace it.`,
            };
          }
          rmSync(targetDir, { recursive: true, force: true });
        }

        cpSync(sourceSkill.baseDir, targetDir, { recursive: true, force: true });

        return {
          success: true,
          output: `Installed skill "${sourceSkill.name}" to ${targetDir}.`,
          data: {
            action: 'install',
            source: sourceSkill.name,
            target,
            location: targetDir,
            note: 'Skill will be available on the next agent turn.',
          },
        };
      }

      const name = args.name?.trim();
      if (!name) {
        return {
          success: false,
          error: 'Missing required field: name (or provide source_skill to copy).',
        };
      }

      const targetSlug = sanitizeSkillSlug(args.slug || name);
      const targetDir = resolve(join(targetSkillsRoot, targetSlug));
      if (!targetDir.startsWith(resolve(targetSkillsRoot))) {
        return {
          success: false,
          error: 'Invalid target path.',
        };
      }

      if (existsSync(targetDir)) {
        if (!overwrite) {
          return {
            success: false,
            error: `Skill already exists at ${targetDir}. Set overwrite=true to replace it.`,
          };
        }
        rmSync(targetDir, { recursive: true, force: true });
      }

      mkdirSync(targetDir, { recursive: true });
      const skillFilePath = join(targetDir, 'SKILL.md');
      const content = args.content?.trim()
        || buildSkillMarkdown({
          name,
          description: args.description,
          instructions: args.instructions,
        });
      writeFileSync(skillFilePath, content, 'utf-8');

      return {
        success: true,
        output: `Created skill "${name}" at ${skillFilePath}.`,
        data: {
          action: 'create',
          name,
          target,
          location: skillFilePath,
          note: 'Skill will be available on the next agent turn.',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
