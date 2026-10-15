import { dataStore } from './data-store';

export class TechnicianService {
  public static async listTechnicians(search = '', cluster = 'Semua cluster') {
    let result = [...dataStore.technicians];

    if (cluster && cluster !== 'Semua cluster') {
      result = result.filter((t) => t.cluster === cluster);
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.fullName.toLowerCase().includes(q) ||
          t.username.toLowerCase().includes(q) ||
          t.cluster.toLowerCase().includes(q)
      );
    }

    // Refresh live ticket counts
    return result.map((tech) => {
      const activeTickets = dataStore.tickets.filter(
        (t) => t.assignedTech === tech.fullName && t.status !== 'Selesai'
      ).length;
      const completedTickets = dataStore.tickets.filter(
        (t) => t.assignedTech === tech.fullName && t.status === 'Selesai'
      ).length;

      return {
        ...tech,
        activeTicketsCount: activeTickets,
        completedTicketsCount: completedTickets,
      };
    });
  }

  public static async toggleTechnicianStatus(username: string, setActive?: boolean, reason?: string) {
    const tech = dataStore.technicians.find(
      (t) => t.username === username || t.fullName.toLowerCase() === username.toLowerCase()
    );

    if (!tech) {
      throw new Error(`Teknisi ${username} tidak ditemukan`);
    }

    const nextState = setActive !== undefined ? setActive : !tech.isActive;
    tech.isActive = nextState;

    // Audit log
    dataStore.activityLogs.push({
      id: `log-${Date.now()}`,
      actorUserId: 'superadmin-1',
      actorRole: 'Super Admin',
      actionType: nextState ? 'TECH_ACTIVATED' : 'TECH_DEACTIVATED',
      targetEntity: 'user',
      targetId: tech.id,
      details: { username: tech.username, isActive: nextState, reason },
      createdAt: new Date().toISOString(),
    });

    return tech;
  }
}
