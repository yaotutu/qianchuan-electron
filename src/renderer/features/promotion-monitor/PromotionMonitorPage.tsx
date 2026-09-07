import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Card, Modal } from '@arco-design/web-react'
import { useSearchParams } from 'react-router-dom'
import { useWorkspaceStore } from '../../app/store'
import { qianchuanApi } from '../../shared/api/qianchuan-api'
import type { MonitorTask, MonitorTaskUpdateInput } from '../../../shared/contracts'
import { showErrorFeedback, showSuccessFeedback } from '../../shared/ui/feedback'
import type { PromotionMonitorPageProps, PromotionMonitorTab } from './model'
import { MonitorCreatePage } from './components/MonitorCreatePage'
import { MonitorFilters } from './components/MonitorFilters'
import { MonitorHeader } from './components/MonitorHeader'
import { MonitorTaskEditorModal } from './components/MonitorTaskEditorModal'
import { MonitorTaskTable } from './components/MonitorTaskTable'
import { MonitorToolbar } from './components/MonitorToolbar'
import { useMonitorTasks } from './hooks/useMonitorTasks'

/**
 * 推广监控入口已经切换为真实本地任务闭环：创建、筛选、启停、编辑、复制和删除。
 * 千川计划读取仍走服务端薄代理，任务 CRUD 则全部通过 preload 进入 Electron 主进程。
 */
export const PromotionMonitorPage = ({ currentAccountId, accounts }: PromotionMonitorPageProps) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: PromotionMonitorTab = searchParams.get('tab') === 'create' ? 'create' : 'manage'
  const [editingTask, setEditingTask] = useState<MonitorTask | null>(null)
  const queryClient = useQueryClient()
  const { selectedTaskIds, setSelectedTaskIds, toggleTask } = useWorkspaceStore()
  const tasksState = useMonitorTasks({
    currentAccountId,
    availableAccountIds: accounts.map((account) => String(account.advertiserId)),
    enabled: tab === 'manage',
  })
  const tasks = tasksState.query.data?.tasks || []

  useEffect(() => setSelectedTaskIds([]), [tasksState.advertiserId, tasksState.page, setSelectedTaskIds])

  const refreshTasks = async () => {
    await queryClient.invalidateQueries({ queryKey: ['promotion-monitor', 'tasks'] })
  }
  const handleMutationResult = async (result: { ok?: boolean; message?: string }, successMessage: string) => {
    if (result.ok !== true) {
      showErrorFeedback(result.message || '操作失败，请重试。')
      return false
    }
    await refreshTasks()
    showSuccessFeedback(successMessage)
    return true
  }

  const updateMutation = useMutation({
    mutationFn: ({ taskId, input }: { taskId: string; input: MonitorTaskUpdateInput }) =>
      qianchuanApi.updateMonitorTask(taskId, input),
    onError: (error) => showErrorFeedback(error instanceof Error ? error.message : '更新任务失败。'),
  })
  const deleteMutation = useMutation({
    mutationFn: (taskId: string) => qianchuanApi.deleteMonitorTask(taskId),
    onError: (error) => showErrorFeedback(error instanceof Error ? error.message : '删除任务失败。'),
  })
  const batchStatusMutation = useMutation({
    mutationFn: ({ taskIds, status }: { taskIds: string[]; status: 'RUNNING' | 'PAUSED' }) =>
      qianchuanApi.batchUpdateMonitorTaskStatus(taskIds, status),
    onError: (error) => showErrorFeedback(error instanceof Error ? error.message : '批量更新失败。'),
  })
  const batchDeleteMutation = useMutation({
    mutationFn: (taskIds: string[]) => qianchuanApi.batchDeleteMonitorTasks(taskIds),
    onError: (error) => showErrorFeedback(error instanceof Error ? error.message : '批量删除失败。'),
  })
  const runNowMutation = useMutation({
    mutationFn: () => qianchuanApi.runMonitorTasksNow(tasksState.advertiserId),
    onSuccess: async (result) => {
      await refreshTasks()
      if (result.ok !== true) {
        showErrorFeedback(result.message || '立即检查失败，请稍后重试。')
        return
      }
      showSuccessFeedback(
        result.skipped
          ? '已有检查正在执行，请稍后查看结果。'
          : `已检查 ${result.checkedCount} 条：触发 ${result.triggeredCount}，正常 ${result.normalCount}，缺少数据 ${result.dataMissingCount}，失败 ${result.errorCount}。`,
      )
    },
    onError: (error) => showErrorFeedback(error instanceof Error ? error.message : '立即检查失败。'),
  })
  const copyMutation = useMutation({
    mutationFn: (task: MonitorTask) =>
      qianchuanApi.createMonitorTasks({
        advertiserId: task.advertiserId,
        plans: [
          {
            id: task.promotionPlanId,
            name: `${task.promotionPlanName}（副本）`,
            productName: task.productName,
            productImage: task.productImage,
            status: task.platformStatus,
          },
        ],
        groupName: task.groupName,
        status: 'PAUSED',
        rule: task.rule,
        action: 'NOTICE',
        intervalMinutes: task.intervalMinutes,
      }),
    onError: (error) => showErrorFeedback(error instanceof Error ? error.message : '复制任务失败。'),
  })

  const changeTab = (nextTab: PromotionMonitorTab) => {
    setSelectedTaskIds([])
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (nextTab === 'manage') next.delete('tab')
        else next.set('tab', 'create')
        next.delete('page')
        return next
      },
      { replace: true },
    )
  }

  const batchStatus = (status: 'RUNNING' | 'PAUSED') => {
    if (!selectedTaskIds.length) return
    batchStatusMutation.mutate(
      { taskIds: selectedTaskIds, status },
      {
        onSuccess: async (result) => {
          if (
            await handleMutationResult(result, status === 'RUNNING' ? '已批量启用监控任务。' : '已批量暂停监控任务。')
          ) {
            setSelectedTaskIds([])
          }
        },
      },
    )
  }

  const batchDelete = () => {
    if (!selectedTaskIds.length) return
    Modal.confirm({
      title: '批量删除监控任务',
      content: `确定删除选中的 ${selectedTaskIds.length} 条本地监控任务吗？此操作不会删除千川计划。`,
      okButtonProps: { status: 'danger' },
      onOk: () =>
        new Promise<void>((resolve, reject) => {
          batchDeleteMutation.mutate(selectedTaskIds, {
            onSuccess: async (result) => {
              if (await handleMutationResult(result, '已删除选中的监控任务。')) {
                setSelectedTaskIds([])
                resolve()
              } else reject(new Error(result.message || '删除失败'))
            },
            onError: reject,
          })
        }),
    })
  }

  return (
    <div className="monitoring-view">
      <MonitorHeader tab={tab} total={tasksState.total} accountCount={accounts.length} onTabChange={changeTab} />
      {tab === 'create' ? (
        <MonitorCreatePage
          accounts={accounts}
          advertiserId={tasksState.advertiserId}
          onAdvertiserChange={tasksState.setAdvertiserId}
          onBack={() => changeTab('manage')}
        />
      ) : (
        <Card className="monitor-panel" bordered={false}>
          <MonitorFilters
            accounts={accounts}
            advertiserId={tasksState.advertiserId}
            keyword={tasksState.keyword}
            status={tasksState.status}
            metric={tasksState.metric}
            action={tasksState.action}
            onAdvertiserChange={tasksState.setAdvertiserId}
            onKeywordChange={tasksState.setKeyword}
            onStatusChange={tasksState.setStatus}
            onMetricChange={tasksState.setMetric}
            onActionChange={tasksState.setAction}
            onReset={tasksState.resetFilters}
          />
          <MonitorToolbar
            selectedCount={selectedTaskIds.length}
            refreshing={tasksState.query.isFetching}
            checking={runNowMutation.isPending}
            onRefresh={() => void tasksState.query.refetch()}
            onRunNow={() => runNowMutation.mutate()}
            onBatchStatus={batchStatus}
            onBatchDelete={batchDelete}
          />
          {tasksState.query.isError && (
            <Alert
              type="error"
              content={
                tasksState.query.error instanceof Error
                  ? tasksState.query.error.message
                  : '读取本地监控任务失败，请稍后重试。'
              }
              action={
                <Button type="text" size="small" onClick={() => void tasksState.query.refetch()}>
                  重试
                </Button>
              }
            />
          )}
          {tasksState.query.data?.ok === false && (
            <Alert type="error" content={tasksState.query.data.message || '读取本地监控任务失败。'} />
          )}
          <MonitorTaskTable
            tasks={tasks}
            accounts={accounts}
            selectedTaskIds={selectedTaskIds}
            total={tasksState.total}
            page={tasksState.page}
            loading={tasksState.query.isPending && tasksState.query.fetchStatus !== 'idle'}
            onToggleTask={toggleTask}
            onTogglePage={(checked) => setSelectedTaskIds(checked ? tasks.map((task) => task.id) : [])}
            onPageChange={tasksState.setPage}
            onEdit={setEditingTask}
            onToggleStatus={(task) =>
              updateMutation.mutate(
                { taskId: task.id, input: { status: task.status === 'RUNNING' ? 'PAUSED' : 'RUNNING' } },
                {
                  onSuccess: (result) =>
                    void handleMutationResult(
                      result,
                      task.status === 'RUNNING' ? '监控任务已暂停。' : '监控任务已启用。',
                    ),
                },
              )
            }
            onCopy={(task) =>
              copyMutation.mutate(task, {
                onSuccess: (result) => void handleMutationResult(result, '已复制任务，新任务默认为暂停状态。'),
              })
            }
            onDelete={(task) =>
              deleteMutation.mutate(task.id, {
                onSuccess: (result) => void handleMutationResult(result, '监控任务已删除。'),
              })
            }
          />
        </Card>
      )}
      <MonitorTaskEditorModal
        task={editingTask}
        visible={Boolean(editingTask)}
        submitting={updateMutation.isPending}
        onCancel={() => setEditingTask(null)}
        onSubmit={(input) => {
          if (!editingTask) return
          updateMutation.mutate(
            { taskId: editingTask.id, input },
            {
              onSuccess: async (result) => {
                if (await handleMutationResult(result, '监控规则已保存。')) setEditingTask(null)
              },
            },
          )
        }}
      />
    </div>
  )
}
