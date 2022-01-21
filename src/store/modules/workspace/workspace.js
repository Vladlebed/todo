import firebase from 'firebase/compat/app';
import { cardInstance, columnInstance, workspaceInstance } from '@/store/modules/workspace/config';
import { convertDatabaseListToClientFormat } from '@/_utils/database';

export default {
  namespaced: true,

  state: {
    workspace: {
      current: null,
      list: [],
    },
  },

  mutations: {
    setCurrentWorkspace: (state, { uid }) => {
      state.workspace.current = state.workspace.list.find((workspace) => workspace.uid === uid);
    },
    updateWorkspaceList: (state, list) => {
      state.workspace.list = list;
    },
    addColumn: (state, column) => {
      state.workspace.current.data.columns.push(column);
    },
    // eslint-disable-next-line no-unused-vars
    addCard: (state, { columnUid, card }) => {
      state.workspace.current.data.columns
        .find((column) => column.uid === columnUid)
        .data
        .cards
        .push(card);
    },
    removeColumn: (state, columnUid) => {
      const index = state.workspace.current.data.columns.findIndex((column) => column.uid === columnUid);
      state.workspace.current.data.columns.splice(index, 1);
    },
    removeCard: (state, { columnUid, cardUid }) => {
      const column = state.workspace.current.data.columns.find((_column) => _column.uid === columnUid);
      const cardIndex = column.data.cards.findIndex((card) => card.uid === cardUid);
      column.data.cards.splice(cardIndex, 1);
    },
    changeColumn: (state, { columnUid, columnProperties }) => {
      const column = state.workspace.current.data.columns.find((_column) => _column.uid === columnUid);
      column.data.columnProperties = columnProperties;
    },
    changeCard: (state, { columnUid, cardUid, cardProperties }) => {
      const column = state.workspace.current.data.columns.find((_column) => _column.uid === columnUid);
      const card = column.data.cards.find((_card) => _card.uid === cardUid);
      card.data.cardProperties = cardProperties;
    },
  },

  actions: {
    getCurrentWorkspace: async ({ dispatch, commit, state }) => {
      const uid = await dispatch('user/getUid', {}, { root: true });
      return firebase.database().ref(`/users/${uid}/currentWorkspace`).once('value')
        .then((r) => {
          const workspaceUid = r.val();
          const workspace = workspaceUid ? state.workspace.list.find((_workspace) => _workspace.uid === workspaceUid) : null;

          if (workspace) {
            commit('setCurrentWorkspace', workspace);
          }
        });
    },

    setCurrentWorkspace: async ({ dispatch, commit }, workspace) => {
      const uid = await dispatch('user/getUid', {}, { root: true });
      return firebase.database().ref(`/users/${uid}/currentWorkspace`)
        .set(workspace.uid)
        .then(() => { commit('setCurrentWorkspace', { data: workspace.data, uid: workspace.uid }); });
    },

    fetchWorkspaceList: async ({ dispatch, commit }) => {
      const uid = await dispatch('user/getUid', {}, { root: true });
      return firebase.database().ref(`/users/${uid}/workspaces`).once('value')
        .then((r) => {
          // TODO Сделать рекурсией
          const workspaceList = convertDatabaseListToClientFormat(r.val())
            .map((workspace) => ({
              ...workspace,
              data: {
                ...workspace.data,
                columns: convertDatabaseListToClientFormat(workspace.data.columns)
                  .map((column) => ({
                    ...column,
                    data: {
                      ...column.data,
                      cards: convertDatabaseListToClientFormat(column.data.cards),
                    },
                  })),
              },
            }));
          commit('updateWorkspaceList', workspaceList);
        });
    },

    createWorkspace: async ({ dispatch }, workspaceName) => {
      const uid = await dispatch('user/getUid', {}, { root: true });
      const workspace = workspaceInstance(workspaceName);
      return firebase
        .database()
        .ref(`/users/${uid}/workspaces`)
        .push(workspace)
        .then((r) => {
          dispatch('fetchWorkspaceList')
            .then(() => {
              dispatch('setCurrentWorkspace', {
                uid: r.key,
                data: workspace,
              });
            });
        });
    },

    createColumn: async ({ dispatch, commit, state }) => {
      const uid = await dispatch('user/getUid', {}, { root: true });
      const column = columnInstance();
      return firebase
        .database()
        .ref(`/users/${uid}/workspaces/${state.workspace.current.uid}/columns`)
        .push(column)
        .then((r) => {
          commit('addColumn', {
            uid: r.key,
            data: column,
          });
        });
    },

    createCard: async ({ dispatch, commit, state }, columnUid) => {
      const uid = await dispatch('user/getUid', {}, { root: true });
      const card = cardInstance();
      return firebase
        .database()
        .ref(`/users/${uid}/workspaces/${state.workspace.current.uid}/columns/${columnUid}/cards`)
        .push(card)
        .then((r) => {
          commit('addCard', {
            columnUid,
            card: {
              uid: r.key,
              data: card,
            },
          });
        });
    },

    removeColumn: async ({ dispatch, commit, state }, columnUid) => {
      const uid = await dispatch('user/getUid', {}, { root: true });
      return firebase
        .database()
        .ref(`/users/${uid}/workspaces/${state.workspace.current.uid}/columns/${columnUid}`)
        .remove()
        .then(() => {
          commit('removeColumn', columnUid);
        });
    },

    removeCard: async ({ dispatch, commit, state }, { columnUid, cardUid }) => {
      const uid = await dispatch('user/getUid', {}, { root: true });
      return firebase
        .database()
        .ref(`/users/${uid}/workspaces/${state.workspace.current.uid}/columns/${columnUid}/cards/${cardUid}`)
        .remove()
        .then(() => {
          commit('removeCard', { columnUid, cardUid });
        });
    },

    changeColumn: async ({ dispatch, commit, state }, { columnUid, columnProperties }) => {
      const uid = await dispatch('user/getUid', {}, { root: true });

      return firebase
        .database()
        .ref(`/users/${uid}/workspaces/${state.workspace.current.uid}/columns/${columnUid}/columnProperties`)
        .update(columnProperties)
        .then(() => {
          commit('changeColumn', { columnUid, columnProperties });
        });
    },

    changeCard: async ({ dispatch, commit, state }, { columnUid, cardUid, cardProperties }) => {
      const uid = await dispatch('user/getUid', {}, { root: true });

      return firebase
        .database()
        .ref(`/users/${uid}/workspaces/${state.workspace.current.uid}/columns/${columnUid}/cards/${cardUid}/cardProperties`)
        .update(cardProperties)
        .then(() => {
          commit('changeCard', { columnUid, cardUid, cardProperties });
        });
    },
  },

  getters: {
    currentWorkspace: (s) => s.workspace.current,
  },
};