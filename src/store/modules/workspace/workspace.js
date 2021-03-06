import firebase from 'firebase/compat/app';
import {
  cardInstance,
  columnInstance,
  workspaceInstance,
  urlFactory,
  changeInstance,
} from '@/store/modules/workspace/config';
import { convertDatabaseListToClientFormat, convertListToDatabaseFormat } from '@/_utils/database';
import { cloneDeep, defaultsDeep } from 'lodash';
import { generateColor } from '@/_utils/color';
import router from '@/router';

export default {
  namespaced: true,

  state: {
    workspace: {
      current: null,
      list: [],
    },
  },

  mutations: {
    // region workspaces
    setCurrentWorkspace: (state, { workspace, userUid, workspaceUid }) => {
      if (!workspaceUid) {
        state.workspace.current = null;
        if (userUid) {
          router.replace({ name: 'Dashboard' });
        }
        return;
      }

      const currentWorkspace = workspace || state.workspace.list.find((_workspace) => _workspace.uid === workspaceUid) || {};
      defaultsDeep(currentWorkspace.data, workspaceInstance({}));

      const compareFn = (a, b) => (a.data.properties?.order || 0) - (b.data.properties?.order || 0);
      currentWorkspace.data.columns.sort(compareFn);
      currentWorkspace.data.columns.forEach((column) => { column.data.cards.sort(compareFn); });

      state.workspace.current = currentWorkspace;

      if (router.currentRoute.params.userUid !== userUid || router.currentRoute.params.workspaceUid !== workspaceUid) {
        router.push({ name: 'Workspace', params: { userUid, workspaceUid } });
      }
    },
    updateWorkspaceList: (state, list) => {
      state.workspace.list = list;
    },
    changeWorkspace: (state, properties) => {
      state.workspace.current.data.properties = properties;
    },
    removeWorkspace: (state, workspaceIndex) => {
      state.workspace.list.splice(workspaceIndex, 1);
    },
    // endregion workspaces

    // region columns
    addColumn: (state, column) => {
      state.workspace.current.data.columns.push(column);
    },
    changeColumn: (state, { columnUid, properties }) => {
      const column = state.workspace.current.data.columns.find((_column) => _column.uid === columnUid);
      column.data.properties = properties;
    },
    removeColumn: (state, columnUid) => {
      const index = state.workspace.current.data.columns.findIndex((column) => column.uid === columnUid);
      state.workspace.current.data.columns.splice(index, 1);
    },
    setColumns: (state, columns) => {
      state.workspace.current.data.columns = columns;
    },
    // endregion columns

    // region cards
    addCard: (state, { columnUid, card }) => {
      state.workspace.current.data.columns
        .find((column) => column.uid === columnUid)
        .data
        .cards
        .push(card);
    },
    changeCard: (state, { columnUid, cardUid, properties }) => {
      const column = state.workspace.current.data.columns.find((_column) => _column.uid === columnUid);
      const card = column.data.cards.find((_card) => _card.uid === cardUid);
      card.data.properties = properties;
    },
    updateCards: (state, { columnUid, cards }) => {
      const column = state.workspace.current.data.columns.find((_column) => _column.uid === columnUid);
      column.data.cards = cards;
    },
    removeCard: (state, { columnUid, cardUid }) => {
      const column = state.workspace.current.data.columns.find((_column) => _column.uid === columnUid);
      const cardIndex = column.data.cards.findIndex((card) => card.uid === cardUid);
      column.data.cards.splice(cardIndex, 1);
    },
    // endregion cards
  },

  actions: {
    // region workspaces
    changeWorkspace: async ({ dispatch, commit, state }, properties) => {
      const uid = await dispatch('user/getUid', {}, { root: true });

      return firebase
        .database()
        .ref(urlFactory.WORKSPACE_PROPERTIES(uid, state.workspace.current.uid))
        .update(properties)
        .then(() => { commit('changeWorkspace', properties); });
    },
    getExternalWorkspace: ({ commit }, { userUid, workspaceUid }) => firebase.database().ref(urlFactory.WORKSPACE(userUid, workspaceUid)).once('value')
      .then((r) => {
        const externalWorkspace = r.val();
        if (externalWorkspace.columns) {
          externalWorkspace.columns = convertDatabaseListToClientFormat(externalWorkspace.columns, ['cards']);
        }
        return commit('setCurrentWorkspace', { workspace: { data: externalWorkspace, uid: workspaceUid }, workspaceUid, userUid });
      }),
    getCurrentWorkspace: async ({ dispatch, commit, state }) => {
      const uid = await dispatch('user/getUid', {}, { root: true });

      return firebase.database().ref(urlFactory.WORKSPACE_CURRENT(uid)).once('value')
        .then((r) => {
          const workspaceUid = r.val();
          const workspace = workspaceUid ? state.workspace.list.find((_workspace) => _workspace.uid === workspaceUid) : null;

          if (workspace) {
            commit('setCurrentWorkspace', { workspaceUid: workspace.uid, userUid: uid });
          }
          return workspace;
        });
    },
    setCurrentWorkspace: async ({ dispatch, commit }, workspace) => {
      const uid = await dispatch('user/getUid', {}, { root: true });
      const methodName = workspace ? 'set' : 'remove';

      return firebase.database().ref(urlFactory.WORKSPACE_CURRENT(uid))[methodName](workspace?.uid)
        .then(() => {
          commit('setCurrentWorkspace', workspace ? { workspaceUid: workspace.uid, userUid: uid } : {});
        });
    },
    fetchWorkspaceList: async ({ dispatch, commit }) => {
      const uid = await dispatch('user/getUid', {}, { root: true });
      return firebase.database().ref(urlFactory.WORKSPACE_LIST(uid)).once('value')
        .then((r) => {
          const workspaceList = convertDatabaseListToClientFormat(r.val(), ['columns', 'cards']);
          commit('updateWorkspaceList', workspaceList);
          return r.val();
        });
    },
    createWorkspace: async ({ dispatch }, workspaceName) => {
      const uid = await dispatch('user/getUid', {}, { root: true });
      const workspace = workspaceInstance({ workspaceName, backgroundColor: generateColor() });
      return firebase
        .database()
        .ref(urlFactory.WORKSPACE_LIST(uid))
        .push(workspace)
        .then((r) => dispatch('fetchWorkspaceList')
          .then(() => dispatch('setCurrentWorkspace', {
            uid: r.key,
            data: workspace,
          })));
    },
    removeCurrentWorkspace: async ({ dispatch, commit, state }) => {
      const uid = await dispatch('user/getUid', {}, { root: true });
      const currentWorkspace = cloneDeep(state.workspace.current);
      const currentWorkspaceIndex = state.workspace.list.findIndex((workspace) => workspace.uid === state.workspace.current.uid);
      const nextWorkspace = state.workspace.list[currentWorkspaceIndex + 1] || state.workspace.list[currentWorkspaceIndex - 1];

      dispatch('setCurrentWorkspace', nextWorkspace ? { data: nextWorkspace.data, uid: nextWorkspace.uid, userUid: uid } : null);

      commit('removeWorkspace', currentWorkspaceIndex);
      return firebase
        .database()
        .ref(urlFactory.WORKSPACE(uid, currentWorkspace.uid))
        .remove()
        .catch(() => { commit('setCurrentWorkspace', { workspaceUid: currentWorkspace.uid, userUid: uid }); });
    },
    addChangeToChangesList: async ({ dispatch, state, rootGetters }, change) => {
      const uid = await dispatch('user/getUid', {}, { root: true });

      const _change = changeInstance({
        ...change,
        userUid: uid,
        userName: rootGetters['user/user'].displayName || 'Anonim',
      });

      return firebase
        .database()
        .ref(urlFactory.WORKSPACE_CHANGES(uid, state.workspace.current.uid))
        .push(_change);
    },
    // endregion workspaces

    // region columns
    // eslint-disable-next-line no-unused-vars
    createColumn: ({ state, dispatch, rootGetters }, { name, order }) => {
      const uid = router.currentRoute.params.userUid;
      const column = columnInstance({ name, order });

      dispatch('addChangeToChangesList', { action: 'COLUMN_CREATE', value: name });

      return firebase
        .database()
        .ref(urlFactory.COLUMN_LIST(uid, state.workspace.current.uid))
        .push(column);
    },
    removeColumn: ({ state, dispatch }, columnUid) => {
      const uid = router.currentRoute.params.userUid;
      const columnIndex = state.workspace.current.data.columns.findIndex((column) => column.uid === columnUid);

      dispatch('addChangeToChangesList', {
        action: 'COLUMN_REMOVE',
        value: {
          index: columnIndex,
          name: state.workspace.current.data.columns[columnIndex].data.properties.name || '',
        },
      });

      return firebase
        .database()
        .ref(urlFactory.COLUMN(uid, state.workspace.current.uid, columnUid))
        .remove();
    },
    renameColumn: ({ state, dispatch }, { columnUid, properties, newName, oldName }) => {
      const uid = router.currentRoute.params.userUid;

      dispatch('addChangeToChangesList', ({
        action: 'COLUMN_RENAME',
        value: {
          columnUid,
          newName,
          oldName,
        },
      }));

      return firebase
        .database()
        .ref(urlFactory.COLUMN_PROPERTIES(uid, state.workspace.current.uid, columnUid))
        .update(properties);
    },
    updateColumns: ({ state }, newColumns) => {
      const uid = router.currentRoute.params.userUid;
      return firebase
        .database()
        .ref(urlFactory.COLUMN_LIST(uid, state.workspace.current.uid))
        .set(convertListToDatabaseFormat(newColumns, ['cards']));
    },
    setColumns: ({ commit }, columns) => {
      commit('setColumns', columns);
    },
    // endregion columns

    // region cards
    createCard: ({ state, dispatch }, { name, columnUid, order, columnName }) => {
      const uid = router.currentRoute.params.userUid;
      const card = cardInstance({ name, order });

      dispatch('addChangeToChangesList', ({
        action: 'CARD_CREATE',
        value: {
          columnUid,
          name,
          columnName,
        },
      }));

      return firebase
        .database()
        .ref(urlFactory.CARD_LIST(uid, state.workspace.current.uid, columnUid))
        .push(card);
    },
    changeCard: ({ state, dispatch }, { columnUid, columnName, cardUid, newProperties, oldProperties }) => {
      const uid = router.currentRoute.params.userUid;

      if (newProperties.description !== oldProperties.description) {
        dispatch('addChangeToChangesList', ({
          action: newProperties.description ? 'CARD_CHANGE_DESCRIPTION' : 'CARD_REMOVE_DESCRIPTION',
          value: {
            columnUid,
            columnName,
            cardName: newProperties.name,
            description: newProperties.description || null,
          },
        }));
      }

      if (newProperties.name !== oldProperties.name) {
        dispatch('addChangeToChangesList', ({
          action: 'CARD_RENAME',
          value: {
            columnUid,
            columnName,
            newCardName: newProperties.name,
            oldCardName: oldProperties.name,
          },
        }));
      }

      return firebase
        .database()
        .ref(urlFactory.CARD_PROPERTIES(uid, state.workspace.current.uid, columnUid, cardUid))
        .update(newProperties);
    },
    updateCards: ({ state }, { columnUid, cards }) => {
      const uid = router.currentRoute.params.userUid;
      return firebase
        .database()
        .ref(urlFactory.CARD_LIST(uid, state.workspace.current.uid, columnUid))
        .set(convertListToDatabaseFormat(cards));
    },
    removeCard: ({ state, dispatch }, { columnUid, cardUid, cardName, columnName }) => {
      const uid = router.currentRoute.params.userUid;

      dispatch('addChangeToChangesList', ({
        action: 'CARD_REMOVE',
        value: {
          columnUid,
          cardUid,
          cardName,
          columnName,
        },
      }));

      return firebase
        .database()
        .ref(urlFactory.CARD(uid, state.workspace.current.uid, columnUid, cardUid))
        .remove();
    },
    // endregion cards
  },
  getters: {
    currentWorkspace: (s) => s.workspace.current,
    currentWorkspaceProperties: (s) => s.workspace.current?.data.properties || {},
    currentWorkspaceHasImage: (s) => !!s.workspace.current?.data.properties?.backgroundImage?.name,
  },
};
