export function setupHeader(element, title) {
  element.innerHTML = `
    <nav class="max-w-screen-x min-h-(--header-height)">
      <div class="max-w-screen-xl flex flex-wrap items-center justify-between mx-auto p-4">
        <a href="/" class="flex items-center space-x-3">
          <img src="/images/vite.svg" class"h-8" alt="Flowbite Logo" />
          <span class="self-center text-2xl font-semibold whitespace-nowrap text-sky-950 dark:text-white ml-2 rtl:mr-2">${title}</span>
        </a>
        <div class="w-full md:block md:w-auto">
          <div class="flex flex-col items-center md:flex-row gap-2">
            <ul class="font-medium w-full flex flex-col p-2 md:p-0 mt-4 border border-gray-100 rounded-lg md:flex-row md:space-x-4 md:mt-0 md:border-0 bg-gray-100 md:bg-gray-200 dark:bg-gray-600  md:dark:bg-gray-800 dark:border-gray-700">
              <li>
                <a class="block py-2 px-3 rounded-sm md:bg-transparent text-blue-950 md:p-0 dark:text-white md:dark:text-blue-500" href="/">خانه</a>
              </li>
            </ul>             
          </div>
        </div>
      </div>
    </nav
`;
}
