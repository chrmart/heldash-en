import { create } from 'zustand'
import { api } from '../api'
import type { UnraidInstance, UnraidInfo, UnraidArray, UnraidParityHistory, UnraidContainer, UnraidVm, UnraidShare, UnraidUser, UnraidNotifications, UnraidConfig, UnraidPhysicalDisk } from '../types/unraid'

interface UnraidState {
  instances:      UnraidInstance[]
  selectedId:     string | null
  online:         Record<string, boolean>
  info:           Record<string, UnraidInfo>
  array:          Record<string, UnraidArray>
  parity:         Record<string, UnraidParityHistory[]>
  docker:         Record<string, UnraidContainer[]>
  vms:            Record<string, UnraidVm[]>
  shares:         Record<string, UnraidShare[]>
  users:          Record<string, UnraidUser[]>
  notifications:  Record<string, UnraidNotifications>
  config:         Record<string, UnraidConfig>
  physicalDisks:  Record<string, UnraidPhysicalDisk[]>
  loading:        Record<string, boolean>
  errors:         Record<string, string | null>

  loadInstances:       () => Promise<void>
  setSelected:         (id: string) => void
  pingInstance:        (id: string) => Promise<void>
  pingAll:             () => Promise<void>
  loadInfo:            (id: string) => Promise<void>
  loadArray:           (id: string) => Promise<void>
  loadParity:          (id: string) => Promise<void>
  loadDocker:          (id: string) => Promise<void>
  loadVms:             (id: string) => Promise<void>
  loadShares:          (id: string) => Promise<void>
  loadUsers:           (id: string) => Promise<void>
  loadNotifications:   (id: string) => Promise<void>
  loadConfig:          (id: string) => Promise<void>
  arrayStart:          (id: string) => Promise<void>
  arrayStop:           (id: string) => Promise<void>
  parityStart:         (id: string, correct: boolean) => Promise<void>
  parityPause:         (id: string) => Promise<void>
  parityResume:        (id: string) => Promise<void>
  parityCancel:        (id: string) => Promise<void>
  diskSpinUp:          (id: string, diskId: string) => Promise<void>
  diskSpinDown:        (id: string, diskId: string) => Promise<void>
  dockerControl:        (id: string, name: string, action: 'start' | 'stop' | 'restart' | 'unpause' | 'pause') => Promise<void>
  dockerUpdate:         (id: string, name: string) => Promise<void>
  dockerUpdateAll:      (id: string) => Promise<void>
  vmControl:            (id: string, uuid: string, action: 'start' | 'stop' | 'pause' | 'resume' | 'forcestop' | 'reboot' | 'reset') => Promise<void>
  loadPhysicalDisks:    (id: string) => Promise<void>
  diskMount:            (id: string, diskId: string) => Promise<void>
  diskUnmount:          (id: string, diskId: string) => Promise<void>
  archiveNotification:     (id: string, nId: string) => Promise<void>
  archiveAllNotifications: (id: string) => Promise<void>
  loadNotificationsArchive: (id: string) => Promise<void>
  createInstance:      (data: { name: string; url: string; api_key: string }) => Promise<void>
  updateInstance:      (id: string, data: object) => Promise<void>
  deleteInstance:      (id: string) => Promise<void>
  reorderInstances:    (ids: string[]) => Promise<void>
}

export const useUnraidStore = create<UnraidState>((set, get) => ({
  instances:     [],
  selectedId:    null,
  online:        {},
  info:          {},
  array:         {},
  parity:        {},
  docker:        {},
  vms:           {},
  shares:        {},
  users:         {},
  notifications: {},
  config:        {},
  physicalDisks: {},
  loading:       {},
  errors:        {},

  loadInstances: async () => {
    try {
      const instances = await api.unraid.instances.list()
      set(s => {
        const selectedId = s.selectedId ?? (instances.find(i => i.enabled)?.id ?? null)
        return { instances, selectedId }
      })
    } catch (e) {
      set(s => ({ errors: { ...s.errors, _instances: (e as Error).message } }))
    }
  },

  setSelected: (id) => set({ selectedId: id }),

  pingInstance: async (id) => {
    try {
      const res = await api.unraid.ping(id)
      set(s => ({ online: { ...s.online, [id]: res.online } }))
    } catch {
      set(s => ({ online: { ...s.online, [id]: false } }))
    }
  },

  pingAll: async () => {
    const { instances } = get()
    await Promise.allSettled(instances.map(i => get().pingInstance(i.id)))
  },

  loadInfo: async (id) => {
    set(s => ({ loading: { ...s.loading, [`info_${id}`]: true } }))
    try {
      const data = await api.unraid.info(id)
      set(s => ({ info: { ...s.info, [id]: data }, errors: { ...s.errors, [`info_${id}`]: null } }))
    } catch (e) {
      set(s => ({ errors: { ...s.errors, [`info_${id}`]: (e as Error).message } }))
    } finally {
      set(s => ({ loading: { ...s.loading, [`info_${id}`]: false } }))
    }
  },

  loadArray: async (id) => {
    set(s => ({ loading: { ...s.loading, [`array_${id}`]: true } }))
    try {
      const data = await api.unraid.array(id)
      set(s => ({ array: { ...s.array, [id]: data }, errors: { ...s.errors, [`array_${id}`]: null } }))
    } catch (e) {
      set(s => ({ errors: { ...s.errors, [`array_${id}`]: (e as Error).message } }))
    } finally {
      set(s => ({ loading: { ...s.loading, [`array_${id}`]: false } }))
    }
  },

  loadParity: async (id) => {
    try {
      const data = await api.unraid.parity(id)
      const history = data?.parityHistory ?? []
      set(s => ({ parity: { ...s.parity, [id]: history } }))
    } catch { /* stale data preserved */ }
  },

  loadDocker: async (id) => {
    set(s => ({ loading: { ...s.loading, [`docker_${id}`]: true } }))
    try {
      const data = await api.unraid.docker(id)
      set(s => ({ docker: { ...s.docker, [id]: data }, errors: { ...s.errors, [`docker_${id}`]: null } }))
    } catch (e) {
      set(s => ({ errors: { ...s.errors, [`docker_${id}`]: (e as Error).message } }))
    } finally {
      set(s => ({ loading: { ...s.loading, [`docker_${id}`]: false } }))
    }
  },

  loadVms: async (id) => {
    set(s => ({ loading: { ...s.loading, [`vms_${id}`]: true } }))
    try {
      const data = await api.unraid.vms(id)
      const domains = data?.vms?.domains ?? []
      set(s => ({ vms: { ...s.vms, [id]: domains }, errors: { ...s.errors, [`vms_${id}`]: null } }))
    } catch (e) {
      set(s => ({ errors: { ...s.errors, [`vms_${id}`]: (e as Error).message } }))
    } finally {
      set(s => ({ loading: { ...s.loading, [`vms_${id}`]: false } }))
    }
  },

  loadShares: async (id) => {
    set(s => ({ loading: { ...s.loading, [`shares_${id}`]: true } }))
    try {
      const data = await api.unraid.shares(id)
      const shares = data?.shares ?? []
      set(s => ({ shares: { ...s.shares, [id]: shares }, errors: { ...s.errors, [`shares_${id}`]: null } }))
    } catch (e) {
      set(s => ({ errors: { ...s.errors, [`shares_${id}`]: (e as Error).message } }))
    } finally {
      set(s => ({ loading: { ...s.loading, [`shares_${id}`]: false } }))
    }
  },

  loadUsers: async (id) => {
    set(s => ({ loading: { ...s.loading, [`users_${id}`]: true } }))
    try {
      const data = await api.unraid.users(id)
      const users = data?.users ?? []
      set(s => ({ users: { ...s.users, [id]: users }, errors: { ...s.errors, [`users_${id}`]: null } }))
    } catch (e) {
      set(s => ({ errors: { ...s.errors, [`users_${id}`]: (e as Error).message } }))
    } finally {
      set(s => ({ loading: { ...s.loading, [`users_${id}`]: false } }))
    }
  },

  loadNotifications: async (id) => {
    set(s => ({ loading: { ...s.loading, [`notif_${id}`]: true } }))
    try {
      const data = await api.unraid.notifications(id)
      set(s => ({ notifications: { ...s.notifications, [id]: data }, errors: { ...s.errors, [`notif_${id}`]: null } }))
    } catch (e) {
      set(s => ({ errors: { ...s.errors, [`notif_${id}`]: (e as Error).message } }))
    } finally {
      set(s => ({ loading: { ...s.loading, [`notif_${id}`]: false } }))
    }
  },

  loadConfig: async (id) => {
    set(s => ({ loading: { ...s.loading, [`config_${id}`]: true } }))
    try {
      const data = await api.unraid.config(id)
      set(s => ({ config: { ...s.config, [id]: data }, errors: { ...s.errors, [`config_${id}`]: null } }))
    } catch (e) {
      set(s => ({ errors: { ...s.errors, [`config_${id}`]: (e as Error).message } }))
    } finally {
      set(s => ({ loading: { ...s.loading, [`config_${id}`]: false } }))
    }
  },

  arrayStart: async (id) => {
    await api.unraid.arrayStart(id)
    await get().loadArray(id)
  },

  arrayStop: async (id) => {
    await api.unraid.arrayStop(id)
    await get().loadArray(id)
  },

  parityStart: async (id, correct) => {
    await api.unraid.parityStart(id, correct)
    await get().loadArray(id)
  },

  parityPause: async (id) => {
    await api.unraid.parityPause(id)
    await get().loadArray(id)
  },

  parityResume: async (id) => {
    await api.unraid.parityResume(id)
    await get().loadArray(id)
  },

  parityCancel: async (id) => {
    await api.unraid.parityCancel(id)
    await get().loadArray(id)
  },

  diskSpinUp: async (id, diskId) => {
    await api.unraid.diskSpinUp(id, diskId)
    await get().loadArray(id)
  },

  diskSpinDown: async (id, diskId) => {
    await api.unraid.diskSpinDown(id, diskId)
    await get().loadArray(id)
  },

  dockerControl: async (id, name, action) => {
    await api.unraid.dockerControl(id, name, action)
    await get().loadDocker(id)
  },

  dockerUpdate: async (id, name) => {
    await api.unraid.dockerUpdate(id, name)
    await get().loadDocker(id)
  },

  dockerUpdateAll: async (id) => {
    await api.unraid.dockerUpdateAll(id)
    await get().loadDocker(id)
  },

  vmControl: async (id, uuid, action) => {
    await api.unraid.vmControl(id, uuid, action)
    await get().loadVms(id)
  },

  loadPhysicalDisks: async (id) => {
    set(s => ({ loading: { ...s.loading, [`pdisks_${id}`]: true } }))
    try {
      const data = await api.unraid.physicalDisks(id)
      set(s => ({ physicalDisks: { ...s.physicalDisks, [id]: data.disks ?? [] }, errors: { ...s.errors, [`pdisks_${id}`]: null } }))
    } catch (e) {
      set(s => ({ errors: { ...s.errors, [`pdisks_${id}`]: (e as Error).message } }))
    } finally {
      set(s => ({ loading: { ...s.loading, [`pdisks_${id}`]: false } }))
    }
  },

  diskMount: async (id, diskId) => {
    await api.unraid.diskMount(id, diskId)
    await get().loadArray(id)
  },

  diskUnmount: async (id, diskId) => {
    await api.unraid.diskUnmount(id, diskId)
    await get().loadArray(id)
  },

  loadNotificationsArchive: async (id) => {
    set(s => ({ loading: { ...s.loading, [`notif_archive_${id}`]: true } }))
    try {
      const data = await api.unraid.notificationsArchive(id)
      set(s => ({
        notifications: {
          ...s.notifications,
          [id]: {
            ...s.notifications[id],
            notifications: {
              ...s.notifications[id]?.notifications,
              archive: data.list ?? [],
            },
          },
        },
        errors: { ...s.errors, [`notif_archive_${id}`]: null },
      }))
    } catch (e) {
      set(s => ({ errors: { ...s.errors, [`notif_archive_${id}`]: (e as Error).message } }))
    } finally {
      set(s => ({ loading: { ...s.loading, [`notif_archive_${id}`]: false } }))
    }
  },

  archiveNotification: async (id, nId) => {
    try {
      await api.unraid.archiveNotification(id, nId)
      await get().loadNotifications(id)
    } catch (e) {
      set(s => ({ errors: { ...s.errors, [id]: (e as Error).message } }))
      throw e
    }
  },

  archiveAllNotifications: async (id) => {
    try {
      await api.unraid.archiveAllNotifications(id)
      await get().loadNotifications(id)
    } catch (e) {
      set(s => ({ errors: { ...s.errors, [id]: (e as Error).message } }))
      throw e
    }
  },

  createInstance: async (data) => {
    await api.unraid.instances.create(data)
    await get().loadInstances()
  },

  updateInstance: async (id, data) => {
    await api.unraid.instances.update(id, data)
    await get().loadInstances()
  },

  deleteInstance: async (id) => {
    await api.unraid.instances.delete(id)
    set(s => ({
      instances: s.instances.filter(i => i.id !== id),
      selectedId: s.selectedId === id ? (s.instances.find(i => i.id !== id && i.enabled)?.id ?? null) : s.selectedId,
    }))
  },

  reorderInstances: async (ids) => {
    await api.unraid.instances.reorder(ids)
    await get().loadInstances()
  },
}))
