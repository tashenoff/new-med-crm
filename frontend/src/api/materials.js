import { apiClient, handleApiError } from './config';

const buildParams = (search, status = 'active') => {
  const params = { status };
  if (search) {
    params.search = search;
  }
  return params;
};

export const materialsApi = {
  list: async (search, status = 'active') => {
    try {
      const response = await apiClient.get('/materials', {
        params: buildParams(search, status)
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },

  create: async (materialData) => {
    try {
      const response = await apiClient.post('/materials', materialData);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },

  update: async (id, materialData) => {
    try {
      const response = await apiClient.put(`/materials/${id}`, materialData);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },

  delete: async (id) => {
    try {
      await apiClient.delete(`/materials/${id}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  }
,
  restore: async (id) => {
    try {
      const response = await apiClient.post(`/materials/${id}/restore`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  },
  exportExcel: async (search, status = 'active') => {
    try {
      const response = await apiClient.get('/materials/export', {
        params: buildParams(search, status),
        responseType: 'arraybuffer'
      });
      return {
        success: true,
        data: response.data,
        filename: response.headers['content-disposition']
      };
    } catch (error) {
      return { success: false, error: handleApiError(error) };
    }
  }
};
