from pathlib import Path
path = Path('src/components/directory/ServicePrices.js')
text = path.read_text(encoding='cp1251', errors='replace')
marker = '  const handlePanelAction = () => {'
start = text.index(marker)
end = text.index('};', start) + 2
head = text[:end]
render_block = """
  const panelActionLabel = activeTab === 'services' ? '+ Добавить услугу' : '+ Добавить категорию';

  return (
    <div className={`space-y-6 ${themeClasses.bg.secondary}`}>
      <PanelHeader
        title="Прайс-лист"
        subtitle="Управляйте услугами и категориями в одном месте"
        onAction={handlePanelAction}
        actionLabel={panelActionLabel}
      />

      <div className="space-y-6">
        {activeTab === 'services' ? (
          <>
            <div className="bg-white p-6 rounded-lg shadow border border-gray-100">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClasses}>Поиск</label>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Введите название услуги или код..."
                    className={inputClasses}
                  />
                </div>
                <div>
                  <label className={labelClasses}>Категория</label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className={inputClasses}
                  >
                    <option value="">Все категории</option>
                    {categories.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">Всего услуг</p>
                    <p className="text-2xl font-bold text-blue-600">{servicePrices.length}</p>
                  </div>
                  <div className="text-blue-500 text-2xl">➐</div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">Категорий</p>
                    <p className="text-2xl font-bold text-green-600">{categories.length}</p>
                  </div>
                  <div className="text-green-500 text-2xl">➝</div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow border-l-4 border-purple-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">Средняя цена</p>
                    <p className="text-2xl font-bold text-purple-600">
                      {servicePrices.length > 0
                        ? (servicePrices.reduce((sum, p) => sum + p.price, 0) / servicePrices.length).toFixed(0)
                        : 0
                      } ₸
                    </p>
                  </div>
                  <div className="text-purple-500 text-2xl">₽</div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow border-l-4 border-orange-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">Найдено</p>
                    <p className="text-2xl font-bold text-orange-600">{filteredPrices.length}</p>
                  </div>
                  <div className="text-orange-500 text-2xl">✌</div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-gray-500">Загружаем цены на услуги...</div>
                </div>
              ) : filteredPrices.length === 0 ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center text-gray-500">
                    <div className="text-4xl mb-2">☹</div>
                    <p>Услуги не найдены</p>
                    <p className="text-sm mt-1">Попробуйте изменить фильтры или добавить новую услугу</p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Услуга</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Код</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Категория</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Цена</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Единица</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Описание</th>
                        {user?.role === 'admin' && (
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Действия</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredPrices.map(price => (
                        <tr key={price.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="font-medium text-gray-900">{price.service_name}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {price.service_code || '—'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {price.category ? (
                              <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                                {price.category}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-lg font-medium text-green-600">{price.price.toLocaleString()} ₸</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {price.unit}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500 max-w-xs">
                            <div className="truncate" title={price.description}>
                              {price.description || '—'}
                            </div>
                          </td>
                          {user?.role === 'admin' && (
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleEdit(price)}
                                  className="text-blue-600 hover:text-blue-900"
                                >
                                  Изменить
                                </button>
                                <button
                                  onClick={() => handleDelete(price.id)}
                                  className="text-red-600 hover:text-red-900"
                                >
                                  Удалить
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">Всего категорий</p>
                    <p className="text-2xl font-bold text-green-600">{serviceCategories.length}</p>
                  </div>
                  <div className="text-green-500 text-2xl">➝</div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">Услуг в категориях</p>
                    <p className="text-2xl font-bold text-blue-600">{servicePrices.filter(p => p.category).length}</p>
                  </div>
                  <div className="text-blue-500 text-2xl">➐</div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow border-l-4 border-purple-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">Без категории</p>
                    <p className="text-2xl font-bold text-purple-600">{servicePrices.filter(p => !p.category).length}</p>
                  </div>
                  <div className="text-purple-500 text-2xl">–</div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-gray-500">Загружаем категории...</div>
                </div>
              ) : serviceCategories.length === 0 ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center text-gray-500">
                    <div className="text-4xl mb-2">➝</div>
                    <p>Категории не найдены</p>
                    <p className="text-sm mt-1">Добавьте первую категорию для организации услуг</p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Название категории</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Описание</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Услуг в категории</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Дата создания</th>
                        {user?.role === 'admin' && (
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Действия</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {serviceCategories.map(category => (
                        <tr key={category.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="text-2xl mr-3">➝</div>
                              <div className="font-medium text-gray-900">{category.name}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500 max-w-xs">
                            <div className="truncate" title={category.description}>
                              {category.description || '—'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                              {servicePrices.filter(p => p.category === category.name).length} услуг
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(category.created_at).toLocaleDateString('ru-RU')}
                          </td>
                          {user?.role === 'admin' && (
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleEditCategory(category)}
                                  className="text-blue-600 hover:text-blue-900"
                                >
                                  Изменить
                                </button>
                                <button
                                  onClick={() => handleDeleteCategory(category.id)}
                                  className="text-red-600 hover:text-red-900"
                                >
                                  Удалить
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <Modal
        show={showModal}
        onClose={handleCloseModal}
        title={editingPrice ? 'Редактировать услугу' : 'Добавить новую услугу'}
        errorMessage={error}
        size="max-w-md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClasses}>Название услуги *</label>
            <input
              type="text"
              value={priceForm.service_name}
              onChange={(e) => setPriceForm({...priceForm, service_name: e.target.value})}
              className={inputClasses}
              required
            />
          </div>

          <div>
            <label className={labelClasses}>Код услуги</label>
            <input
              type="text"
              value={priceForm.service_code}
              onChange={(e) => setPriceForm({...priceForm, service_code: e.target.value})}
              className={inputClasses}
              placeholder="Например: THER-001"
            />
          </div>

          <div>
            <label className={labelClasses}>Категория *</label>
            <select
              value={priceForm.category}
              onChange={(e) => setPriceForm({...priceForm, category: e.target.value})}
              className={inputClasses}
              required
            >
              <option value="">Выберите категорию</option>
              {serviceCategories.map(category => (
                <option key={category.id} value={category.name}>{category.name}</option>
              ))}
            </select>
            {serviceCategories.length === 0 && (
              <p className="text-sm text-gray-500 mt-1">
                Сначала создайте категорию во вкладке "Категории"
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClasses}>Цена (₸) *</label>
              <input
                type="number"
                value={priceForm.price}
                onChange={(e) => setPriceForm({...priceForm, price: e.target.value})}
                className={inputClasses}
                min="0"
                step="0.01"
                required
              />
            </div>

            <div>
              <label className={labelClasses}>Единица</label>
              <select
                value={priceForm.unit}
                onChange={(e) => setPriceForm({...priceForm, unit: e.target.value})}
                className={inputClasses}
              >
                <option value="процедура">процедура</option>
                <option value="зуб">зуб</option>
                <option value="час">час</option>
                <option value="сеанс">сеанс</option>
                <option value="единица">единица</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClasses}>Описание</label>
            <textarea
              value={priceForm.description}
              onChange={(e) => setPriceForm({...priceForm, description: e.target.value})}
              className={inputClasses}
              rows="3"
              placeholder="Дополнительная информация об услуге..."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className={`flex-1 ${buttonPrimaryClasses}`}
            >
              {loading ? 'Сохранение...' : (editingPrice ? 'Обновить' : 'Создать')}
            </button>
            <button
              type="button"
              onClick={handleCloseModal}
              className={`flex-1 ${buttonSecondaryClasses}`}
            >
              Отмена
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        show={showCategoryModal}
        onClose={handleCloseCategoryModal}
        title={editingCategory ? 'Редактировать категорию' : 'Добавить новую категорию'}
        errorMessage={error}
        size="max-w-md"
      >
        <form onSubmit={handleCategorySubmit} className="space-y-4">
          <div>
            <label className={labelClasses}>Название категории *</label>
            <input
              type="text"
              value={categoryForm.name}
              onChange={(e) => setCategoryForm({...categoryForm, name: e.target.value})}
              className={inputClasses}
              required
              placeholder="Например: Терапия, Хирургия, Ортопедия"
            />
          </div>

          <div>
            <label className={labelClasses}>Описание</label>
            <textarea
              value={categoryForm.description}
              onChange={(e) => setCategoryForm({...categoryForm, description: e.target.value})}
              className={inputClasses}
              rows="3"
              placeholder="Описание категории услуг..."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className={`flex-1 ${buttonPrimaryClasses}`}
            >
              {loading ? 'Сохранение...' : (editingCategory ? 'Обновить' : 'Создать')}
            </button>
            <button
              type="button"
              onClick={handleCloseCategoryModal}
              className={`flex-1 ${buttonSecondaryClasses}`}
            >
              Отмена
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
"""
new_text = head + '\n' + render_block + '\nexport default ServicePrices;'
path.write_text(new_text, encoding='utf-8')
PY
