"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import type { DragEvent, MouseEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { listProjects, Project } from "@/lib/api/projects";
import { listAgents as fetchAgents, Agent } from "@/lib/api/agents";
import {
  listTasks as fetchTasks,
  createTask as createTaskApi,
  updateTask as updateTaskApi,
  deleteTask as deleteTaskApi,
  Task,
} from "@/lib/api/tasks";
import {
  listTaskActivity,
  createTaskComment,
  TaskActivity,
} from "@/lib/api/activity";
import {
  MoreHorizontal,
  Plus,
  Star,
  Settings,
  ArrowLeft,
  RotateCcw,
  CheckCircle,
  Calendar,
  Search,
  Filter,
  X as XIcon,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
} from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import ConfirmDeleteModal from "@/components/modals/ConfirmDeleteModal";
import CreateTaskModal from "@/components/modals/CreateTaskModal";
import TaskDetailModal from "@/components/modals/TaskDetailModal";
import ProjectSettingsModal from "@/components/modals/ProjectSettingsModal";
import ProjectChat from "@/components/chat/ProjectChat";

const priorityConfig = {
  HIGH: {
    dot: "bg-red-500",
    label: "High",
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-700",
  },
  MEDIUM: {
    dot: "bg-amber-500",
    label: "Medium",
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
  },
  LOW: {
    dot: "bg-gray-400",
    label: "Low",
    bg: "bg-gray-50",
    border: "border-gray-200",
    text: "text-gray-600",
  },
};

const columns = [
  { id: "inbox", title: "TO DO", color: "bg-indigo-500" },
  { id: "in-progress", title: "IN PROGRESS", color: "bg-blue-500" },
  { id: "review", title: "IN REVIEW", color: "bg-amber-500" },
  { id: "done", title: "DONE", color: "bg-emerald-500" },
];

const buildEmptyTasks = () =>
  columns.reduce(
    (acc, column) => {
      acc[column.id] = [];
      return acc;
    },
    {} as Record<string, Task[]>,
  );

const labelColors: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  Marketing: {
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    border: "border-indigo-200",
  },
  Branding: {
    bg: "bg-purple-50",
    text: "text-purple-700",
    border: "border-purple-200",
  },
  Social: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
  },
  Research: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  Email: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  Design: {
    bg: "bg-pink-50",
    text: "text-pink-700",
    border: "border-pink-200",
  },
  Content: {
    bg: "bg-cyan-50",
    text: "text-cyan-700",
    border: "border-cyan-200",
  },
  Ads: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  Sales: { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200" },
  SEO: {
    bg: "bg-violet-50",
    text: "text-violet-700",
    border: "border-violet-200",
  },
  Partnerships: {
    bg: "bg-orange-50",
    text: "text-orange-700",
    border: "border-orange-200",
  },
  Legal: { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200" },
  Tech: { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200" },
  Growth: {
    bg: "bg-lime-50",
    text: "text-lime-700",
    border: "border-lime-200",
  },
};

// Agent status type
type AgentStatus = "idle" | "working" | "error" | "completed";

// Helper: Format date relative
function formatRelativeDate(dateStr?: string): {
  text: string;
  isOverdue: boolean;
  isSoon: boolean;
} {
  if (!dateStr) return { text: "", isOverdue: false, isSoon: false };

  const date = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  const diffTime = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0)
    return {
      text: `${Math.abs(diffDays)}d overdue`,
      isOverdue: true,
      isSoon: false,
    };
  if (diffDays === 0) return { text: "Today", isOverdue: false, isSoon: true };
  if (diffDays === 1)
    return { text: "Tomorrow", isOverdue: false, isSoon: true };
  if (diffDays <= 3)
    return { text: `${diffDays} days`, isOverdue: false, isSoon: true };
  return {
    text: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    isOverdue: false,
    isSoon: false,
  };
}

// Component: Due Date Badge
function DueDateBadge({ dateStr }: { dateStr?: string }) {
  if (!dateStr) return null;

  const { text, isOverdue, isSoon } = formatRelativeDate(dateStr);

  const bgColor = isOverdue
    ? "bg-red-50"
    : isSoon
      ? "bg-amber-50"
      : "bg-gray-50";
  const textColor = isOverdue
    ? "text-red-600"
    : isSoon
      ? "text-amber-600"
      : "text-gray-500";
  const borderColor = isOverdue
    ? "border-red-200"
    : isSoon
      ? "border-amber-200"
      : "border-gray-200";

  return (
    <span
      className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0 rounded-md border ${bgColor} ${textColor} ${borderColor}`}
    >
      <Calendar className="w-2.5 h-2.5" />
      {text}
    </span>
  );
}

// Component to display agent status with pulse animation
function AgentStatusIndicator({ status }: { status: AgentStatus }) {
  const config = {
    idle: { color: "bg-gray-400", animate: "" },
    working: { color: "bg-blue-500", animate: "animate-pulse" },
    error: { color: "bg-red-500", animate: "" },
    completed: { color: "bg-emerald-500", animate: "" },
  };

  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full ${config[status].color} ${config[status].animate}`}
    />
  );
}

// Component to display task status + agent status
function TaskStatusBadge({
  task,
  columnId,
  agentStatuses,
}: {
  task: Task;
  columnId: string;
  agentStatuses: Record<string, AgentStatus>;
}) {
  const agentStatus = task.assigneeId
    ? agentStatuses[task.assigneeId] || "idle"
    : "idle";

  // Debug log
  if (task.assigneeId && columnId === "in-progress") {
    console.log(
      `[TaskStatusBadge] Task: ${task.title}, Agent: ${task.assigneeId}, Status: ${agentStatus}`,
    );
  }

  // Determine status based on column
  const getStatus = () => {
    switch (columnId) {
      case "inbox":
        return {
          label: "Ready",
          bg: "bg-gray-100",
          text: "text-gray-600",
          border: "border-gray-200",
        };
      case "in-progress":
        // If agent is working, display "Working" instead of "In Progress"
        if (agentStatus === "working") {
          return {
            label: "Working",
            bg: "bg-blue-50",
            text: "text-blue-700",
            border: "border-blue-200",
          };
        }
        return {
          label: "In Progress",
          bg: "bg-blue-50",
          text: "text-blue-700",
          border: "border-blue-200",
        };
      case "review":
        return {
          label: "Needs Review",
          bg: "bg-amber-50",
          text: "text-amber-700",
          border: "border-amber-200",
        };
      case "done":
        return {
          label: "Completed",
          bg: "bg-emerald-50",
          text: "text-emerald-700",
          border: "border-emerald-200",
        };
      default:
        return {
          label: "Ready",
          bg: "bg-gray-100",
          text: "text-gray-600",
          border: "border-gray-200",
        };
    }
  };

  const status = getStatus();

  return (
    <div className="flex items-center gap-1.5">
      {task.assigneeId && columnId === "in-progress" && (
        <AgentStatusIndicator status={agentStatus} />
      )}
      <span
        className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${status.bg} ${status.text} ${status.border}`}
      >
        {status.label}
      </span>
    </div>
  );
}

export default function BoardDetailPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const projectId =
    typeof params?.projectId === "string" ? params.projectId : "";
  const [tasks, setTasks] = useState<Record<string, Task[]>>(buildEmptyTasks);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [draggedFromColumn, setDraggedFromColumn] = useState<string | null>(
    null,
  );
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [isLoadingBoard, setIsLoadingBoard] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const agentsRef = useRef(agents);
  const [agentStatuses, setAgentStatuses] = useState<
    Record<string, AgentStatus>
  >({});
  const tasksRef = useRef(tasks);
  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterAgent, setFilterAgent] = useState<string>("all");

  // View state
  const [viewMode, setViewMode] = useState<"kanban" | "calendar" | "chat">("kanban");
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [createColumnId, setCreateColumnId] = useState("inbox");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskPriority, setTaskPriority] = useState<Task["priority"]>("MEDIUM");
  const [taskAssigneeId, setTaskAssigneeId] = useState("");
  const [taskLabels, setTaskLabels] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskStartDate, setTaskStartDate] = useState("");
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [detailColumnId, setDetailColumnId] = useState("");
  const [detailTitle, setDetailTitle] = useState("");
  const [detailDescription, setDetailDescription] = useState("");
  const [detailPriority, setDetailPriority] =
    useState<Task["priority"]>("MEDIUM");
  const [detailAssigneeId, setDetailAssigneeId] = useState("");
  const [detailLabels, setDetailLabels] = useState("");
  const [detailDueDate, setDetailDueDate] = useState("");
  const [detailStartDate, setDetailStartDate] = useState("");
  const [detailStatus, setDetailStatus] = useState("inbox");
  const [activity, setActivity] = useState<TaskActivity[]>([]);
  const [isActivityLoading, setIsActivityLoading] = useState(false);
  const [activityTab, setActivityTab] = useState<
    "all" | "comments" | "history" | "worklog"
  >("all");
  const [commentText, setCommentText] = useState("");
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    task: Task;
    columnId: string;
    x: number;
    y: number;
  } | null>(null);
  const [confirmDeleteTask, setConfirmDeleteTask] = useState<Task | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    const loadProject = async () => {
      try {
        setIsLoadingProjects(true);
        setProjectError(null);
        const list = await listProjects(user.id);
        const selected =
          list.find((project) => project.id === projectId) || null;
        setCurrentProject(selected);
        if (selected) {
          localStorage.setItem("foxfang_project_id", selected.id);
        }
      } catch (error) {
        setProjectError(
          error instanceof Error ? error.message : "Failed to load project",
        );
      } finally {
        setIsLoadingProjects(false);
      }
    };

    loadProject();
  }, [user, projectId]);

  useEffect(() => {
    if (!user || !projectId) return;

    const loadBoard = async () => {
      try {
        setIsLoadingBoard(true);
        setLoadError(null);
        const [agentsResponse, tasksResponse] = await Promise.all([
          fetchAgents(user.id, projectId),
          fetchTasks(user.id, projectId),
        ]);
        setAgents(agentsResponse);
        const nextTasks = buildEmptyTasks();
        tasksResponse.forEach((task) => {
          const targetColumn = columns.find(
            (column) => column.id === task.status,
          );
          const columnId = targetColumn ? targetColumn.id : "inbox";
          nextTasks[columnId].push(task);
        });
        setTasks(nextTasks);
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Failed to load board data",
        );
      } finally {
        setIsLoadingBoard(false);
      }
    };

    loadBoard();
  }, [user, projectId]);

  // Keep refs in sync with state
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  // Agent status polling - TODO: replace with actual API call when agent status endpoint is ready
  useEffect(() => {
    if (!user || !projectId || agentsRef.current.length === 0) return;
    // Initialize all agents as idle (no mock auto-assign to avoid spurious agent triggers)
    const initialStatuses: Record<string, AgentStatus> = {};
    agentsRef.current.forEach((agent) => {
      initialStatuses[agent.id] = "idle";
    });
    setAgentStatuses(initialStatuses);
  }, [user, projectId, agents]);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    const handleScroll = () => setContextMenu(null);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };

    window.addEventListener("click", handleClick);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleClick);
    window.addEventListener("keydown", handleKey);

    return () => {
      window.removeEventListener("click", handleClick);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [contextMenu]);

  const agentMap = useMemo(() => {
    return agents.reduce(
      (acc, agent) => {
        acc[agent.id] = agent;
        return acc;
      },
      {} as Record<string, Agent>,
    );
  }, [agents]);

  // Filtered tasks per column
  const filteredTasks = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const result: Record<string, Task[]> = {};
    columns.forEach((col) => {
      result[col.id] = (tasks[col.id] || []).filter((task) => {
        if (q && !task.title.toLowerCase().includes(q) && !(task.description || '').toLowerCase().includes(q)) return false;
        if (filterPriority !== "all" && task.priority !== filterPriority) return false;
        if (filterAgent !== "all" && task.assigneeId !== filterAgent) return false;
        return true;
      });
    });
    return result;
  }, [tasks, searchQuery, filterPriority, filterAgent]);

  const hasActiveFilters = searchQuery.trim() !== "" || filterPriority !== "all" || filterAgent !== "all";
  const totalFilteredCount = columns.reduce((sum, col) => sum + (filteredTasks[col.id]?.length || 0), 0);
  const totalCount = columns.reduce((sum, col) => sum + (tasks[col.id]?.length || 0), 0);

  // Calendar Helper
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday
    
    const days = [];
    for (let i = 0; i < firstDayIndex; i++) {
        days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(year, month, i);
        // Find tasks due on this date (local timezone format YYYY-MM-DD from the task object)
        // task.dueDate is usually "YYYY-MM-DD"
        // To be safe against timezones, format our `date` to local YYYY-MM-DD
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;
        
        // Flatten tasks from all columns that match the date
        const dayTasks: Task[] = [];
        columns.forEach(col => {
            if (filteredTasks[col.id]) {
                filteredTasks[col.id].forEach(t => {
                    if (t.dueDate === dateStr) dayTasks.push(t);
                });
            }
        });
        
        // Let's also get today's local date string to accurately highlight "today"
        const todayDate = new Date();
        const ty = todayDate.getFullYear();
        const tm = String(todayDate.getMonth() + 1).padStart(2, '0');
        const td = String(todayDate.getDate()).padStart(2, '0');
        
        days.push({
            date,
            dayNumber: i,
            isToday: dateStr === `${ty}-${tm}-${td}`,
            tasks: dayTasks
        });
    }
    return days;
  }, [currentMonth, filteredTasks]);

  const handlePrevMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const filteredActivity = useMemo(() => {
    const nonAgent = activity.filter((entry) => entry.role !== "agent");
    if (activityTab === "comments") {
      return nonAgent.filter((entry) => entry.role === "user");
    }
    if (activityTab === "history") {
      return nonAgent.filter((entry) => entry.role !== "user");
    }
    if (activityTab === "worklog") {
      return activity.filter(
        (entry) => entry.role === "system" || entry.role === "agent",
      );
    }
    return nonAgent;
  }, [activity, activityTab]);

  const agentResponses = useMemo(
    () => activity.filter((entry) => entry.role === "agent"),
    [activity],
  );

  const handleDragStart = (task: Task, columnId: string) => {
    setDraggedTask(task);
    setDraggedFromColumn(columnId);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: DragEvent, targetColumnId: string) => {
    e.preventDefault();

    if (
      !draggedTask ||
      !draggedFromColumn ||
      draggedFromColumn === targetColumnId
    ) {
      setDraggedTask(null);
      setDraggedFromColumn(null);
      return;
    }

    const movedTask = { ...draggedTask, status: targetColumnId };
    const newTasks = { ...tasks };
    newTasks[draggedFromColumn] = newTasks[draggedFromColumn].filter(
      (t) => t.id !== draggedTask.id,
    );
    newTasks[targetColumnId] = [...newTasks[targetColumnId], movedTask];

    setTasks(newTasks);
    setDraggedTask(null);
    setDraggedFromColumn(null);

    if (user) {
      updateTaskApi({
        userId: user.id,
        projectId,
        taskId: draggedTask.id,
        status: targetColumnId,
      }).catch((error) => {
        setActionError(
          error instanceof Error ? error.message : "Failed to update task",
        );
      });
    }
  };

  const openCreateTaskModal = (columnId: string) => {
    setCreateColumnId(columnId);
    setTaskTitle("");
    setTaskDescription("");
    setTaskPriority("MEDIUM");
    setTaskAssigneeId("");
    setTaskLabels("");
    // Set default dates: start = today, due = tomorrow
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    setTaskStartDate(today.toISOString().split("T")[0]);
    setTaskDueDate(tomorrow.toISOString().split("T")[0]);
    setIsCreateTaskOpen(true);
  };

  const handleCreateTask = async () => {
    if (!taskTitle.trim() || !user || isCreatingTask) return;
    const labels = taskLabels
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean);
    // Task stays in the selected column (no auto-transition)
    const nextStatus = createColumnId;
    try {
      setIsCreatingTask(true);
      const newTask = await createTaskApi({
        userId: user.id,
        projectId,
        title: taskTitle.trim(),
        description: taskDescription.trim() || undefined,
        status: nextStatus,
        priority: taskPriority,
        labels,
        assigneeId: taskAssigneeId || undefined,
        reporterId: user.id,
        taskId: `MOS-${Math.floor(Math.random() * 900 + 100)}`,
        dueDate: taskDueDate || undefined,
        startDate: taskStartDate || undefined,
      });

      setTasks((prev) => ({
        ...prev,
        [newTask.status]: [...prev[newTask.status], newTask],
      }));

      setIsCreateTaskOpen(false);
      setTaskTitle("");
      setTaskDescription("");
      setTaskAssigneeId("");
      setTaskLabels("");
      setTaskDueDate("");
      setTaskStartDate("");
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to create task",
      );
    } finally {
      setIsCreatingTask(false);
    }
  };

  const openDetailModal = (task: Task, columnId: string) => {
    setDetailTask(task);
    setDetailColumnId(columnId);
    setDetailTitle(task.title);
    setDetailDescription(task.description || "");
    setDetailPriority(task.priority);
    setDetailAssigneeId(task.assigneeId || "");
    setDetailLabels(task.labels.join(", "));
    setDetailDueDate(task.dueDate || "");
    setDetailStartDate(task.startDate || "");
    setDetailStatus(task.status || columnId);
    if (user) {
      setIsActivityLoading(true);
      listTaskActivity(user.id, projectId, task.id)
        .then(setActivity)
        .catch((error) => {
          setActionError(
            error instanceof Error ? error.message : "Failed to load activity",
          );
        })
        .finally(() => setIsActivityLoading(false));
    }
  };

  const handleAddComment = async () => {
    if (!user || !detailTask) return;
    const content = commentText.trim();
    if (!content) return;

    try {
      setIsPostingComment(true);
      const entry = await createTaskComment({
        userId: user.id,
        projectId,
        taskId: detailTask.id,
        content,
      });
      setActivity((prev) => [entry, ...prev]);
      setCommentText("");
      setActivityTab("all");
      setTimeout(() => {
        if (!user || !detailTask) return;
        listTaskActivity(user.id, projectId, detailTask.id)
          .then(setActivity)
          .catch(() => undefined);
      }, 1500);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to add comment",
      );
    } finally {
      setIsPostingComment(false);
    }
  };

  const openContextMenu = (
    event: MouseEvent<HTMLButtonElement>,
    task: Task,
    columnId: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 220;
    const menuHeight = 360;
    const x = Math.min(event.clientX, window.innerWidth - menuWidth - 8);
    const y = Math.min(event.clientY, window.innerHeight - menuHeight - 8);
    setContextMenu({ task, columnId, x: Math.max(8, x), y: Math.max(8, y) });
  };

  const removeTaskFromBoard = (taskId: string) => {
    setTasks((prev) => {
      const next = { ...prev };
      columns.forEach((column) => {
        next[column.id] = next[column.id].filter((task) => task.id !== taskId);
      });
      return next;
    });
  };

  const handleCopyLink = async (task: Task) => {
    try {
      const url = `${window.location.origin}/boards/${projectId}?task=${task.id}`;
      await navigator.clipboard.writeText(url);
      setContextMenu(null);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to copy link",
      );
    }
  };

  const handleCopyKey = async (task: Task) => {
    try {
      await navigator.clipboard.writeText(task.taskId || task.id);
      setContextMenu(null);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to copy key",
      );
    }
  };

  const handleDeleteTask = async (task: Task) => {
    if (!user) return;
    try {
      await deleteTaskApi({ userId: user.id, projectId, taskId: task.id });
      removeTaskFromBoard(task.id);
      if (detailTask?.id === task.id) {
        setDetailTask(null);
      }
      setContextMenu(null);
      setConfirmDeleteTask(null);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to delete task",
      );
    } finally {
      setConfirmDeleteTask(null);
    }
  };

  const closeDetailModal = () => {
    setDetailTask(null);
    setActivity([]);
  };

  const handleSaveDetail = async () => {
    if (!detailTask || !detailTitle.trim() || !user) return;

    const updatedLabels = detailLabels
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean);

    const nextStatus = detailAssigneeId ? "in-progress" : detailStatus;
    try {
      const updatedTask = await updateTaskApi({
        userId: user.id,
        projectId,
        taskId: detailTask.id,
        title: detailTitle.trim(),
        description: detailDescription.trim() || undefined,
        status: nextStatus,
        priority: detailPriority,
        labels: updatedLabels,
        assigneeId: detailAssigneeId || null,
        dueDate: detailDueDate || null,
        startDate: detailStartDate || null,
      });

      setTasks((prev) => {
        const next = { ...prev };
        columns.forEach((column) => {
          next[column.id] = next[column.id].filter(
            (task) => task.id !== updatedTask.id,
          );
        });
        const targetColumn = columns.find(
          (column) => column.id === updatedTask.status,
        );
        const columnId = targetColumn ? targetColumn.id : "inbox";
        next[columnId] = [...next[columnId], updatedTask];
        return next;
      });

      if (user) {
        setIsActivityLoading(true);
        listTaskActivity(user.id, projectId, updatedTask.id)
          .then(setActivity)
          .catch((error) => {
            setActionError(
              error instanceof Error
                ? error.message
                : "Failed to load activity",
            );
          })
          .finally(() => setIsActivityLoading(false));
      }
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to update task",
      );
    }
  };

  if (isLoadingProjects || isLoadingBoard) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (projectError || loadError) {
    return (
      <div className="min-h-full flex items-center justify-center px-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 text-sm text-red-600">
          {projectError || loadError}
        </div>
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <div className="bg-white border border-gray-200 rounded-2xl p-8 max-w-md">
          <h2 className="text-xl font-bold mb-2 text-gray-900">
            Project not found
          </h2>
          <p className="text-gray-500 mb-4">
            We could not find this project. Return to projects list to pick
            another one.
          </p>
          <button
            onClick={() => router.push("/boards")}
            className="px-6 py-2 bg-indigo-500 text-white font-medium rounded-xl hover:bg-indigo-600"
          >
            Back to projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/boards")}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-gray-600" />
            </button>

            <div>
              <p className="text-[10px] font-medium text-gray-500 mb-0">
                Project
              </p>
              <h1 className="text-base font-bold text-gray-900">
                {currentProject.name}
              </h1>
            </div>

            <button className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              <Star className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Project settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 p-1 rounded-xl mr-2">
              <button 
                onClick={() => setViewMode("kanban")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === "kanban" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                Board
              </button>
              <button
                onClick={() => setViewMode("calendar")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === "calendar" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                Calendar
              </button>
              <button
                onClick={() => setViewMode("chat")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${viewMode === "chat" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                <MessageSquare className="w-3 h-3" />
                Chat
              </button>
            </div>
            <button
              onClick={() => openCreateTaskModal("inbox")}
              className="px-3 py-1.5 bg-indigo-500 text-white text-xs font-medium rounded-lg hover:bg-indigo-600 transition-colors"
            >
              + New task
            </button>
          </div>
        </div>
      </div>

      {actionError && (
        <div className="px-6 py-3 bg-red-50 border-b border-red-200 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {/* Filter Bar */}
      <div className="px-4 py-2 flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="flex items-center gap-2 bg-white rounded-lg px-2.5 py-1.5 border border-gray-200 flex-1 min-w-[140px] max-w-[220px]">
          <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent text-xs outline-none flex-1 min-w-0 placeholder-gray-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-gray-400 hover:text-gray-600">
              <XIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Priority Filter */}
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none cursor-pointer text-gray-700 hover:border-gray-300 transition-colors"
          >
            <option value="all">All Priorities</option>
            <option value="HIGH">🔴 High</option>
            <option value="MEDIUM">🟡 Medium</option>
            <option value="LOW">⚪ Low</option>
          </select>
        </div>

        {/* Agent Filter */}
        <select
          value={filterAgent}
          onChange={(e) => setFilterAgent(e.target.value)}
          className="text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none cursor-pointer text-gray-700 hover:border-gray-300 transition-colors"
        >
          <option value="all">All Agents</option>
          <option value="">Unassigned</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>{agent.name}</option>
          ))}
        </select>

        {/* Active filter indicator */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              {totalFilteredCount}/{totalCount} tasks
            </span>
            <button
              onClick={() => { setSearchQuery(""); setFilterPriority("all"); setFilterAgent("all"); }}
              className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
            >
              <XIcon className="w-3 h-3" /> Clear filters
            </button>
          </div>
        )}
      </div>

      {viewMode === "chat" ? (
        <div className="flex-1 overflow-hidden">
          <ProjectChat projectId={projectId} />
        </div>
      ) : viewMode === "kanban" ? (
        <div className="flex-1 overflow-x-auto overflow-y-hidden hide-scrollbar">
          <div className="flex min-w-max h-full p-6 gap-5">
            {columns.map((column) => (
              <div
                key={column.id}
                className="w-[260px] min-w-[260px] shrink-0 flex flex-col h-full bg-white border border-gray-200 rounded-xl overflow-hidden"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, column.id)}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${column.color}`} />
                    <h3 className="text-[10px] font-semibold uppercase tracking-wide text-gray-700">
                      {column.title}
                    </h3>
                    <span className="text-[10px] text-gray-400 font-medium bg-white px-1.5 py-0 rounded-full border border-gray-200">
                      {hasActiveFilters ? `${filteredTasks[column.id]?.length || 0}/${tasks[column.id]?.length || 0}` : (tasks[column.id]?.length || 0)}
                    </span>
                  </div>
                  <button className="text-gray-400 hover:text-gray-600 transition-colors">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>

                {/* Tasks Container */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2 hide-scrollbar">
                  {filteredTasks[column.id]?.length === 0 && (
                    <div className="text-[10px] text-gray-400 text-center py-6 px-3 border-2 border-dashed border-gray-200 rounded-lg whitespace-nowrap">
                      {hasActiveFilters ? "No matching tasks" : "No tasks yet"}
                    </div>
                  )}

                  {filteredTasks[column.id]?.map((task) => (
                    <button
                      key={task.id}
                      draggable
                      onDragStart={() => handleDragStart(task, column.id)}
                      onClick={() => openDetailModal(task, column.id)}
                      onContextMenu={(event) =>
                        openContextMenu(event, task, column.id)
                      }
                      className="w-full text-left bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:border-gray-300 transition-all group"
                    >
                      {/* Labels */}
                      <div className="mb-2 flex flex-wrap gap-1">
                        {task.labels.slice(0, 3).map((label) => {
                          const colors = labelColors[label] || {
                            bg: "bg-gray-50",
                            text: "text-gray-600",
                            border: "border-gray-200",
                          };
                          return (
                            <span
                              key={label}
                              className={`inline-block text-[9px] px-1.5 py-0 rounded-md font-medium ${colors.bg} ${colors.text} border ${colors.border}`}
                            >
                              {label}
                            </span>
                          );
                        })}
                      </div>

                      <h4 className="text-xs font-medium text-gray-900 mb-2 leading-snug">
                        {task.title}
                      </h4>

                      {/* Due date + recurring badges */}
                      {(task.dueDate || task.isRecurring) && (
                        <div className="mb-2 flex flex-wrap gap-1 items-center">
                          {task.dueDate && (
                            <DueDateBadge dateStr={task.dueDate} />
                          )}
                          {task.isRecurring && (
                            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0 rounded-md font-medium bg-violet-50 text-violet-600 border border-violet-200">
                              <RotateCcw className="w-2 h-2" />
                              Recurring
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div
                            className={`w-1.5 h-1.5 rounded-full ${priorityConfig[task.priority].dot}`}
                          />
                          <span className="text-[10px] text-gray-500">
                            {task.assigneeId
                              ? agentMap[task.assigneeId]?.name?.split(" ")[0] ||
                                "Assignee"
                              : "Unassigned"}
                          </span>
                        </div>
                        <TaskStatusBadge
                          task={task}
                          columnId={column.id}
                          agentStatuses={agentStatuses}
                        />
                      </div>
                    </button>
                  ))}

                  <button
                    onClick={() => openCreateTaskModal(column.id)}
                    className="w-full py-2 flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:bg-gray-50 rounded-lg transition-colors font-medium border border-dashed border-gray-200 hover:border-gray-300 whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span className="whitespace-nowrap">Create task</span>
                  </button>
                </div>
              </div>
            ))}

            <div className="w-[260px] min-w-[260px] shrink-0">
              <button className="w-full py-3 flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:bg-white hover:border-gray-300 rounded-xl transition-all font-medium border border-dashed border-gray-300">
                <Plus className="w-3.5 h-3.5" />
                Add column
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col px-4 pb-4 overflow-hidden">
          <div className="flex items-center justify-between py-3">
            <h2 className="text-sm font-bold text-gray-900">
              {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </h2>
            <div className="flex items-center gap-1.5">
              <button onClick={handlePrevMonth} className="p-1 hover:bg-gray-100 rounded-md border border-gray-200"><ChevronLeft className="w-3.5 h-3.5 text-gray-600" /></button>
              <button onClick={() => setCurrentMonth(new Date())} className="px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-md border border-gray-200">Today</button>
              <button onClick={handleNextMonth} className="p-1 hover:bg-gray-100 rounded-md border border-gray-200"><ChevronRight className="w-3.5 h-3.5 text-gray-600" /></button>
            </div>
          </div>
          
          <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-xl overflow-hidden flex-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="bg-gray-50 py-1.5 text-center text-[10px] font-semibold text-gray-500 border-b border-gray-200">{day}</div>
            ))}
            {calendarDays.map((dayObj, i) => (
              <div key={i} className={`bg-white p-1.5 flex flex-col min-h-[80px] overflow-hidden ${dayObj?.isToday ? 'bg-indigo-50/20' : ''}`}>
                {dayObj ? (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full ${dayObj.isToday ? 'bg-indigo-500 text-white' : 'text-gray-600'}`}>
                        {dayObj.dayNumber}
                      </span>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-0.5 hide-scrollbar">
                      {dayObj.tasks.map(task => {
                        const colColor = columns.find(c => c.id === task.status)?.color?.replace('bg-', 'bg-').replace('500', '100') || 'bg-gray-100';
                        const textColMap: Record<string, string> = {
                          'bg-indigo-100': 'text-indigo-800',
                          'bg-blue-100': 'text-blue-800',
                          'bg-amber-100': 'text-amber-800',
                          'bg-emerald-100': 'text-emerald-800',
                        };
                        const textColor = textColMap[colColor] || 'text-gray-800';
                        return (
                          <div 
                            key={task.id} 
                            onClick={() => openDetailModal(task, task.status)}
                            className={`text-[10px] px-2 py-1.5 rounded-lg truncate cursor-pointer transition-colors ${colColor} ${textColor} hover:brightness-95 font-medium`}
                          >
                            {task.title}
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setContextMenu(null)}
        >
          <div
            className="absolute w-[220px] rounded-xl bg-white border border-gray-200 z-50 py-2"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-50">
              Move work item
              <span className="text-gray-400">›</span>
            </button>
            <button className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-50">
              Change status
              <span className="text-gray-400">›</span>
            </button>
            <div className="h-px bg-gray-200 my-1" />
            <button
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
              onClick={() => handleCopyLink(contextMenu.task)}
            >
              Copy link
            </button>
            <button
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
              onClick={() => handleCopyKey(contextMenu.task)}
            >
              Copy key
            </button>
            <div className="h-px bg-gray-200 my-1" />
            <button className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50">
              Add flag
            </button>
            <button className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50">
              Add label
            </button>
            <div className="h-px bg-gray-200 my-1" />
            <button
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              onClick={() => {
                setConfirmDeleteTask(contextMenu.task);
                setContextMenu(null);
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {confirmDeleteTask && (
        <ConfirmDeleteModal
          open={!!confirmDeleteTask}
          title="Delete task"
          description={`Are you sure you want to delete "${confirmDeleteTask.title}"? This action cannot be undone.`}
          onCancel={() => setConfirmDeleteTask(null)}
          onConfirm={() => handleDeleteTask(confirmDeleteTask)}
        />
      )}

      <CreateTaskModal
        open={isCreateTaskOpen}
        isCreating={isCreatingTask}
        onClose={() => setIsCreateTaskOpen(false)}
        onSubmit={handleCreateTask}
        taskTitle={taskTitle}
        setTaskTitle={setTaskTitle}
        taskDescription={taskDescription}
        setTaskDescription={setTaskDescription}
        createColumnId={createColumnId}
        setCreateColumnId={setCreateColumnId}
        taskPriority={taskPriority}
        setTaskPriority={setTaskPriority}
        taskAssigneeId={taskAssigneeId}
        setTaskAssigneeId={setTaskAssigneeId}
        taskLabels={taskLabels}
        setTaskLabels={setTaskLabels}
        taskStartDate={taskStartDate}
        setTaskStartDate={setTaskStartDate}
        taskDueDate={taskDueDate}
        setTaskDueDate={setTaskDueDate}
        columns={columns}
        priorityConfig={priorityConfig}
        agents={agents}
      />

      {isSettingsOpen && currentProject && user && (
        <ProjectSettingsModal
          open={isSettingsOpen}
          project={currentProject}
          userId={user.id}
          onClose={() => setIsSettingsOpen(false)}
          onUpdated={(updated) => {
            setCurrentProject(updated);
            setIsSettingsOpen(false);
          }}
          onDeleted={() => {
            router.push("/boards");
          }}
        />
      )}

      <TaskDetailModal
        open={!!detailTask}
        task={detailTask}
        userId={user?.id || ""}
        title={detailTitle}
        onTitleChange={setDetailTitle}
        description={detailDescription}
        onDescriptionChange={setDetailDescription}
        status={detailStatus}
        onStatusChange={setDetailStatus}
        assigneeId={detailAssigneeId}
        onAssigneeChange={setDetailAssigneeId}
        priority={detailPriority}
        onPriorityChange={setDetailPriority}
        labels={detailLabels}
        onLabelsChange={setDetailLabels}
        startDate={detailStartDate}
        onStartDateChange={setDetailStartDate}
        dueDate={detailDueDate}
        onDueDateChange={setDetailDueDate}
        columns={columns}
        priorityConfig={priorityConfig}
        agents={agents}
        agentNameById={(agentId) => agentMap[agentId || ""]?.name || "Agent"}
        reporterName={user?.name || user?.email || "Unknown"}
        agentResponses={agentResponses}
        activity={filteredActivity}
        isActivityLoading={isActivityLoading}
        activityTab={activityTab}
        onActivityTabChange={setActivityTab}
        commentText={commentText}
        onCommentChange={setCommentText}
        onAddComment={handleAddComment}
        isPostingComment={isPostingComment}
        onClose={closeDetailModal}
        onSave={handleSaveDetail}
        onRequestChanges={() => {
          // Move from IN REVIEW back to IN PROGRESS
          if (detailTask && user) {
            updateTaskApi({
              userId: user.id,
              projectId,
              taskId: detailTask.id,
              status: "in-progress",
            })
              .then((updated) => {
                setTasks((prev) => {
                  const next = { ...prev };
                  next["review"] = next["review"].filter(
                    (t) => t.id !== updated.id,
                  );
                  next["in-progress"] = [...next["in-progress"], updated];
                  return next;
                });
                setDetailTask(null);
              })
              .catch((error) => {
                setActionError(
                  error instanceof Error
                    ? error.message
                    : "Failed to move task",
                );
              });
          }
        }}
        onApprove={() => {
          // Move from IN REVIEW to DONE
          if (detailTask && user) {
            updateTaskApi({
              userId: user.id,
              projectId,
              taskId: detailTask.id,
              status: "done",
            })
              .then((updated) => {
                setTasks((prev) => {
                  const next = { ...prev };
                  next["review"] = next["review"].filter(
                    (t) => t.id !== updated.id,
                  );
                  next["done"] = [...next["done"], updated];
                  return next;
                });
                setDetailTask(null);
              })
              .catch((error) => {
                setActionError(
                  error instanceof Error
                    ? error.message
                    : "Failed to approve task",
                );
              });
          }
        }}
      />
    </div>
  );
}
