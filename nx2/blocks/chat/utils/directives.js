import { DIRECTIVE_TYPE } from '../constants.js';
import { parseDirectives } from './parse.js';

export function parseDirectiveJSON(content) {
  try {
    return JSON.parse(content.trim());
  } catch {
    return null;
  }
}

export function parseToolOutput(output) {
  if (typeof output !== 'string') return output;
  return parseDirectiveJSON(output);
}

function buildTaskStatusMap(directives) {
  const updates = new Map();
  for (const d of directives) {
    if (d.kind === 'directive' && d.type === DIRECTIVE_TYPE.TASK_ITEM) {
      const data = parseDirectiveJSON(d.content);
      if (data?.label) updates.set(data.label, data.status);
    }
  }
  return updates;
}

export function mergeTaskItemsFromText(plan, streamingText) {
  if (!streamingText || !plan?.tasks?.length) return plan;
  const updates = buildTaskStatusMap(parseDirectives(streamingText));
  if (!updates.size) return plan;
  return {
    ...plan,
    tasks: plan.tasks.map((t) => ({ ...t, status: updates.get(t.label) ?? t.status })),
  };
}

export function mergeTaskItemsIntoPlan(directives) {
  const planIdx = directives.findIndex((d) => d.kind === 'directive' && d.type === DIRECTIVE_TYPE.PLAN);
  if (planIdx < 0) return directives;

  const updates = buildTaskStatusMap(directives.slice(planIdx + 1));

  if (!updates.size) return directives;

  const planData = parseDirectiveJSON(directives[planIdx].content);
  if (!planData?.tasks) return directives;

  const merged = directives.map((d, i) => {
    if (i === planIdx) {
      return {
        ...d,
        content: JSON.stringify({
          ...planData,
          tasks: planData.tasks.map((t) => ({ ...t, status: updates.get(t.label) ?? t.status })),
        }),
      };
    }
    if (i > planIdx && d.kind === 'directive' && d.type === DIRECTIVE_TYPE.TASK_ITEM) {
      return null;
    }
    return d;
  });

  return merged.filter(Boolean);
}
