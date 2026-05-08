import { applyFieldChange as mutateFieldValue } from '../services/mutation/value-mutator.js';

export function createFieldStateController({
  formStore,
  validate,
}) {
  return {
    applyFieldChange({ pointer, value }) {
      const node = formStore.getNode(pointer);
      if (node?.readonly) {
        return { changed: false, state: formStore.getState() };
      }

      const result = formStore.applyMutation(mutateFieldValue, {
        pointer,
        value,
        node,
      });

      if (!result.changed) return result;

      const validation = validate(formStore.getState());
      formStore.setValidation(validation);

      return {
        ...result,
        validation,
      };
    },
  };
}
