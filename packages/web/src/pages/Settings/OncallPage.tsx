import { Badge, Box, Button, Group, NumberInput, Select, SimpleGrid, Table, Text, TextInput } from '@mantine/core';
import { notify } from '../../utils/notify';
import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import {
  PageHeader,
  LoadingSpinner,
  SaveIcon,
  PhoneIcon,
} from '../../components';

type Slot = { role: 'consultant' | 'registrar'; cycleLength: number; position: number; clinicianId: number; startDate?: string | null };
type Clinician = { id: number; name: string; role: 'consultant' | 'registrar' };

const fetchData = async () => {
  const [cyclesRes, cliniciansRes] = await Promise.all([
    api.get<Slot[]>('/api/oncall-cycles'),
    api.get<Clinician[]>('/api/clinicians')
  ]);
  return { cycles: cyclesRes.data, clinicians: cliniciansRes.data };
};

export const OncallPage: React.FC = () => {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['oncall', 'data'], queryFn: fetchData });
  const [consCycleLength, setConsCycleLength] = useState(7);
  const [regCycleLength, setRegCycleLength] = useState(7);
  const [consStartDate, setConsStartDate] = useState('2024-01-01');
  const [regStartDate, setRegStartDate] = useState('2024-01-01');
  const [slots, setSlots] = useState<Slot[]>([]);

  useEffect(() => {
    if (data?.cycles) {
      const cons = data.cycles.find((c) => c.role === 'consultant');
      if (cons) {
        setConsCycleLength(cons.cycleLength);
        setConsStartDate(cons.startDate ? cons.startDate.slice(0, 10) : '2024-01-01');
      }
      const reg = data.cycles.find((c) => c.role === 'registrar');
      if (reg) {
        setRegCycleLength(reg.cycleLength);
        setRegStartDate(reg.startDate ? reg.startDate.slice(0, 10) : '2024-01-01');
      }
      setSlots(data.cycles);
    }
  }, [data]);

  const clinicianOptions = useMemo(
    () =>
      (data?.clinicians || []).map((c) => ({
        value: c.id.toString(),
        label: c.name,
        role: c.role
      })),
    [data?.clinicians]
  );

  const updateSlot = (role: 'consultant' | 'registrar', position: number, clinicianId: number) => {
    setSlots((prev) => {
      const other = prev.filter((s) => !(s.role === role && s.position === position));
      return [
        ...other,
        {
          role,
          position,
          clinicianId,
          cycleLength: role === 'consultant' ? consCycleLength : regCycleLength,
          startDate: role === 'consultant' ? consStartDate : regStartDate
        }
      ];
    });
  };

  const addSlot = (role: 'consultant' | 'registrar') => {
    const roleSlots = slots.filter((s) => s.role === role);
    const nextPos = roleSlots.length ? Math.max(...roleSlots.map((s) => s.position)) + 1 : 1;
    const first = clinicianOptions.find((c) => c.role === role);
    setSlots((prev) => [
      ...prev,
      {
        role,
        position: nextPos,
        clinicianId: first ? Number(first.value) : 0,
        cycleLength: role === 'consultant' ? consCycleLength : regCycleLength,
        startDate: role === 'consultant' ? consStartDate : regStartDate
      }
    ]);
  };

  const deleteSlot = (role: 'consultant' | 'registrar', position: number) => {
    setSlots((prev) => prev.filter((s) => !(s.role === role && s.position === position)));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const consultantSlots = slots.filter((c) => c.role === 'consultant');
      const registrarSlots = slots.filter((c) => c.role === 'registrar');
      return api.put('/api/oncall-cycles', {
        consultant: {
          cycleLength: consCycleLength,
          startDate: consStartDate,
          slots: consultantSlots.map(({ position, clinicianId }) => ({ position, clinicianId }))
        },
        registrar: {
          cycleLength: regCycleLength,
          startDate: regStartDate,
          slots: registrarSlots.map(({ position, clinicianId }) => ({ position, clinicianId }))
        }
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oncall', 'data'] });
      notify.show({
        title: 'Success',
        message: 'On-call cycles saved successfully',
        color: 'green',
      });
    },
    onError: (error: any) => {
      notify.show({
        title: 'Error',
        message: error?.response?.data?.message || error?.message || 'Failed to save on-call cycles',
        color: 'red',
      });
    },
  });

  const consultantSlots = slots.filter((c) => c.role === 'consultant').sort((a, b) => a.position - b.position);
  const registrarSlots = slots.filter((c) => c.role === 'registrar').sort((a, b) => a.position - b.position);

  return (
    <Box>
      <PageHeader
        title="On-Call Cycles"
        subtitle="Configure rotating on-call schedules for consultants and registrars"
        actions={
          <Button
            onClick={() => saveMutation.mutate()}
            loading={saveMutation.isPending}
            leftSection={<SaveIcon />}
          >
            Save Changes
          </Button>
        }
      />

      {isLoading && <LoadingSpinner message="Loading on-call cycles..." />}

      {data && (
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
          {/* Consultant Cycle Card */}
          <Box
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 16,
              overflow: 'hidden',
              border: '1px solid rgba(0, 0, 0, 0.06)',
            }}
          >
            {/* Card Header */}
            <Box
              px={24}
              py={20}
              style={{
                backgroundColor: '#fafafa',
                borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
              }}
            >
              <Group justify="space-between" align="center">
                <Group gap="sm">
                  <Box
                    style={{
                      width: 40,
                      height: 40,
                      backgroundColor: 'rgba(0, 113, 227, 0.1)',
                      borderRadius: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <PhoneIcon size={20} color="#0071e3" />
                  </Box>
                  <Box>
                    <Text fw={600} c="#1d1d1f">Consultants</Text>
                    <Text size="sm" c="dimmed">On-call rotation</Text>
                  </Box>
                </Group>
                <Group gap="xs">
                  <Badge variant="light" color="blue" radius="md">
                    {consCycleLength} week cycle
                  </Badge>
                  <Button size="xs" variant="light" onClick={() => addSlot('consultant')}>
                    Add Slot
                  </Button>
                </Group>
              </Group>
            </Box>

            {/* Cycle Length */}
            <Box px={24} py={16} style={{ borderBottom: '1px solid rgba(0, 0, 0, 0.04)' }}>
              <Text size="sm" fw={500} c="#1d1d1f" mb={8}>Cycle Length (weeks)</Text>
              <NumberInput
                value={consCycleLength}
                onChange={(v) => setConsCycleLength(Number(v) || 1)}
                min={1}
                max={52}
                style={{ maxWidth: 120 }}
              />
              <TextInput
                mt="sm"
                label="Cycle start date"
                type="date"
                value={consStartDate}
                onChange={(e) => setConsStartDate(e.currentTarget.value)}
                styles={{ input: { maxWidth: 220 } }}
              />
            </Box>

            {/* Slots Table */}
            {consultantSlots.length > 0 ? (
              <Table verticalSpacing="sm" horizontalSpacing="lg">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ width: 100 }}>Position</Table.Th>
                    <Table.Th>Clinician</Table.Th>
                    <Table.Th style={{ width: 120 }}>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {consultantSlots.map((slot) => (
                    <Table.Tr key={`c-${slot.position}`}>
                      <Table.Td>
                        <Badge variant="light" color="gray" radius="md">
                          #{slot.position}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Select
                          data={clinicianOptions.filter((c) => c.role === 'consultant')}
                          value={slot.clinicianId.toString()}
                          onChange={(v) => v && updateSlot('consultant', slot.position, Number(v))}
                          placeholder="Select clinician"
                        />
                      </Table.Td>
                      <Table.Td>
                        <Button
                          size="xs"
                          variant="subtle"
                          color="red"
                          onClick={() => deleteSlot('consultant', slot.position)}
                        >
                          Delete
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            ) : (
              <Box px={24} py={32} ta="center">
                <Text c="dimmed" size="sm">No consultant slots configured</Text>
              </Box>
            )}
          </Box>

          {/* Registrar Cycle Card */}
          <Box
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 16,
              overflow: 'hidden',
              border: '1px solid rgba(0, 0, 0, 0.06)',
            }}
          >
            {/* Card Header */}
            <Box
              px={24}
              py={20}
              style={{
                backgroundColor: '#fafafa',
                borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
              }}
            >
              <Group justify="space-between" align="center">
                <Group gap="sm">
                  <Box
                    style={{
                      width: 40,
                      height: 40,
                      backgroundColor: 'rgba(175, 82, 222, 0.1)',
                      borderRadius: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <PhoneIcon size={20} color="#af52de" />
                  </Box>
                  <Box>
                    <Text fw={600} c="#1d1d1f">Registrars</Text>
                    <Text size="sm" c="dimmed">On-call rotation</Text>
                  </Box>
                </Group>
                <Group gap="xs">
                  <Badge variant="light" color="grape" radius="md">
                    {regCycleLength} day cycle
                  </Badge>
                  <Button size="xs" variant="light" onClick={() => addSlot('registrar')}>
                    Add Slot
                  </Button>
                </Group>
              </Group>
            </Box>

            {/* Cycle Length */}
            <Box px={24} py={16} style={{ borderBottom: '1px solid rgba(0, 0, 0, 0.04)' }}>
              <Text size="sm" fw={500} c="#1d1d1f" mb={8}>Cycle Length (days)</Text>
              <NumberInput
                value={regCycleLength}
                onChange={(v) => setRegCycleLength(Number(v) || 1)}
                min={1}
                max={365}
                style={{ maxWidth: 120 }}
              />
              <TextInput
                mt="sm"
                label="Cycle start date"
                type="date"
                value={regStartDate}
                onChange={(e) => setRegStartDate(e.currentTarget.value)}
                styles={{ input: { maxWidth: 220 } }}
              />
            </Box>

            {/* Slots Table */}
            {registrarSlots.length > 0 ? (
              <Table verticalSpacing="sm" horizontalSpacing="lg">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ width: 100 }}>Position</Table.Th>
                    <Table.Th>Clinician</Table.Th>
                    <Table.Th style={{ width: 120 }}>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {registrarSlots.map((slot) => (
                    <Table.Tr key={`r-${slot.position}`}>
                      <Table.Td>
                        <Badge variant="light" color="gray" radius="md">
                          #{slot.position}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Select
                          data={clinicianOptions.filter((c) => c.role === 'registrar')}
                          value={slot.clinicianId.toString()}
                          onChange={(v) => v && updateSlot('registrar', slot.position, Number(v))}
                          placeholder="Select clinician"
                        />
                      </Table.Td>
                      <Table.Td>
                        <Button
                          size="xs"
                          variant="subtle"
                          color="red"
                          onClick={() => deleteSlot('registrar', slot.position)}
                        >
                          Delete
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            ) : (
              <Box px={24} py={32} ta="center">
                <Text c="dimmed" size="sm">No registrar slots configured</Text>
              </Box>
            )}
          </Box>
        </SimpleGrid>
      )}
    </Box>
  );
};
