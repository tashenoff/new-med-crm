// Утилитарные классы для элементов форм с поддержкой темной темы
export const inputClasses = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400";

export const selectClasses = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-white";

export const textareaClasses = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400";

export const labelClasses = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

export const buttonPrimaryClasses = "bg-blue-600 dark:bg-blue-700 text-white py-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50";

export const buttonSecondaryClasses = "bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 py-2 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500";

export const buttonSuccessClasses = "bg-green-600 dark:bg-green-700 text-white py-2 rounded-lg hover:bg-green-700 dark:hover:bg-green-600 disabled:opacity-50";

export const buttonDangerClasses = "bg-red-600 dark:bg-red-700 text-white py-2 rounded-lg hover:bg-red-700 dark:hover:bg-red-600";

export const cardClasses = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700";

export const cardHeaderClasses = "bg-gray-50 dark:bg-gray-700 p-4 rounded-lg border border-gray-200 dark:border-gray-600";

export const tabClasses = (isActive) => `py-2 px-1 border-b-2 font-medium text-sm ${
  isActive
    ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
}`;

export const tableClasses = "min-w-full bg-white dark:bg-gray-800";

export const tableHeaderClasses = "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300";

export const tableRowClasses = "border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700";

export const tableCellClasses = "py-2 px-3 text-gray-900 dark:text-white";
