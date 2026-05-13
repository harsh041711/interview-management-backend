import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { accountApi } from '@/api/accountApi';
import { extractError } from '@/api/axios';

export const validateSetupToken = createAsyncThunk(
  'accountSetup/validate',
  async (token, { rejectWithValue }) => {
    try {
      return await accountApi.validateToken(token);
    } catch (err) {
      return rejectWithValue(extractError(err));
    }
  },
);

export const submitSetup = createAsyncThunk(
  'accountSetup/submit',
  async ({ token, password }, { rejectWithValue }) => {
    try {
      return await accountApi.setup({ token, password });
    } catch (err) {
      return rejectWithValue(extractError(err));
    }
  },
);

const slice = createSlice({
  name: 'accountSetup',
  initialState: {
    validateStatus: 'idle',
    validateError: null,
    info: null, // { email, name, purpose }
    submitStatus: 'idle',
    submitError: null,
  },
  reducers: {
    reset(state) {
      state.validateStatus = 'idle';
      state.validateError = null;
      state.info = null;
      state.submitStatus = 'idle';
      state.submitError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(validateSetupToken.pending, (state) => {
        state.validateStatus = 'loading';
        state.validateError = null;
      })
      .addCase(validateSetupToken.fulfilled, (state, action) => {
        state.validateStatus = 'succeeded';
        state.info = action.payload;
      })
      .addCase(validateSetupToken.rejected, (state, action) => {
        state.validateStatus = 'failed';
        state.validateError = action.payload || { message: 'Invalid link' };
      })
      .addCase(submitSetup.pending, (state) => {
        state.submitStatus = 'loading';
        state.submitError = null;
      })
      .addCase(submitSetup.fulfilled, (state) => {
        state.submitStatus = 'succeeded';
      })
      .addCase(submitSetup.rejected, (state, action) => {
        state.submitStatus = 'failed';
        state.submitError = action.payload || { message: 'Could not set password' };
      });
  },
});

export const { reset } = slice.actions;
export default slice.reducer;
