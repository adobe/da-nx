function groupChecksByCategory(evaluations) {
  const groups = new Map();
  (evaluations ?? []).forEach((check) => {
    const categoryId = check.category_id ?? 'uncategorized';
    const categoryName = check.category ?? 'Uncategorized';
    if (!groups.has(categoryId)) groups.set(categoryId, { categoryId, categoryName, checks: [] });
    groups.get(categoryId).checks.push(check);
  });
  return [...groups.values()];
}

function sectionSummary(section) {
  const successful = section?.successful_checks ?? 0;
  const failed = section?.failed_checks ?? 0;
  const notApplicable = section?.not_applicable_checks ?? 0;
  const error = section?.error_checks ?? 0;
  const denominator = successful + failed;
  const percent = denominator ? Math.round((successful / denominator) * 100) : 0;
  return {
    successful,
    failed,
    notApplicable,
    error,
    total: successful + failed + notApplicable + error,
    percent,
  };
}

function evaluationSummaryText(input) {
  const sections = [input?.text_evaluation, ...(input?.image_evaluations ?? [])].filter(Boolean);
  const { successful, total } = sections.reduce((acc, section) => {
    const summary = sectionSummary(section);
    return {
      successful: acc.successful + summary.successful,
      total: acc.total + summary.successful + summary.failed,
    };
  }, { successful: 0, total: 0 });

  if (!total) return `Evaluation complete for ${input?.brand_name ?? 'page'}`;
  return `${successful}/${total} checks passed`;
}

export { groupChecksByCategory, sectionSummary, evaluationSummaryText };
