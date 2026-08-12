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

export { groupChecksByCategory, sectionSummary };
