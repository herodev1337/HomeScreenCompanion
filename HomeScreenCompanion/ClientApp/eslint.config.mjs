/** ESLint config — type-aware rules only.
 * Kept minimal per the plan §9 + 0.5 #3 decision:
 * `@typescript-eslint/recommended-type-checked` catches real bugs
 * (no-floating-promises, no-misused-promises, no-base-to-string,
 * no-unsafe-*) without style noise. Stylistic enforcement is intentionally
 * out of scope. Some recommended-type-checked rules are relaxed for the
 * existing codebase — `no-unnecessary-type-assertion` and `no-this-alias`
 * produce false positives against `noUncheckedIndexedAccess`-narrowed DOM
 * lookups (we use `el as HTMLElement` as a deliberate narrowing escape
 * hatch per the established pattern in plan §0.3 A).
 */
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    extends: [tseslint.configs.recommendedTypeChecked],
    rules: {
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/triple-slash-reference': 'off',
    },
  },
  {
    files: ['src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
    },
  },
);