<template>
  <section class="page-card page">
    <div class="page-header">
      <div>
        <h2 class="page-title">简历库</h2>
        <p class="page-subtitle">集中查看候选人状态、所属岗位和当前面试进度。</p>
      </div>
      <div class="toolbar">
        <el-input
          v-model="filters.keyword"
          placeholder="搜索姓名 / 电话 / 邮箱 / 学校 / 公司 / 岗位"
          clearable
          style="width: 220px"
          @keyup.enter="handleSearch"
        />
        <el-select v-model="filters.job_id" placeholder="岗位筛选" style="width: 200px" clearable @change="fetchResumes">
          <el-option v-for="job in jobs" :key="job.id" :label="job.title" :value="job.id" />
        </el-select>
        <el-select v-model="filters.source" placeholder="来源筛选" style="width: 180px" clearable @change="fetchResumes">
          <el-option label="全部来源" value="" />
          <el-option label="手动录入" value="manual" />
          <el-option label="BOSS直聘" value="boss" />
          <el-option label="拉勾" value="lagou" />
          <el-option label="邮箱" value="email" />
        </el-select>
        <el-select v-model="filters.status" placeholder="状态筛选" style="width: 180px" @change="fetchResumes">
          <el-option label="全部状态" value="all" />
          <el-option v-for="item in statusOptions" :key="item" :label="toLabel(item, statusLabelMap)" :value="item" />
        </el-select>
        <el-button @click="handleSearch">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
        <el-button type="primary" @click="dialogVisible = true">上传简历</el-button>
      </div>
    </div>

    <el-table ref="tableRef" :data="resumes" class="content-table" width="100%">
      <el-table-column prop="name" label="姓名" min-width="120" />
      <el-table-column prop="gender" label="性别" min-width="80" />
      <el-table-column prop="age" label="年龄" min-width="80" />
      <el-table-column prop="education" label="学历" min-width="100" />
      <el-table-column label="工作年限" min-width="110">
        <template #default="{ row }">
          {{ row.work_years ? `${row.work_years}年` : '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="school_major" label="学校及专业" min-width="220" show-overflow-tooltip />
      <el-table-column prop="current_company" label="所在公司" min-width="180" show-overflow-tooltip />
      <el-table-column prop="current_position" label="所在岗位" min-width="160" show-overflow-tooltip />
      <el-table-column prop="phone" label="电话" min-width="140" />
      <el-table-column prop="email" label="邮箱" min-width="220" />
      <el-table-column label="岗位" min-width="180">
        <template #default="{ row }">
          {{ row.Job?.title || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="状态" min-width="150">
        <template #default="{ row }">
          <span class="status-pill">{{ toLabel(row.status, statusLabelMap) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="面试进度" min-width="140">
        <template #default="{ row }">
          {{ row.current_round }}/{{ row.total_rounds }}
        </template>
      </el-table-column>
      <el-table-column label="邮箱收到时间" min-width="180">
        <template #default="{ row }">
          {{ row.source === 'email' ? formatTime(row.source_received_at) : '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="received_at" label="入库时间" min-width="180" :formatter="formatDateCell" />
      <el-table-column label="简历文件" min-width="120">
        <template #default="{ row }">
          <el-link :href="fileUrl(row.file_url)" target="_blank" type="primary">查看</el-link>
        </template>
      </el-table-column>
      <el-table-column label="操作" min-width="160" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link @click="openEdit(row)">编辑</el-button>
          <el-button type="primary" link @click="openDetail(row)">详情</el-button>
          <el-button type="danger" link @click="confirmDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination">
      <el-pagination
        background
        layout="total, prev, pager, next"
        :total="total"
        :current-page="page"
        :page-size="pageSize"
        @current-change="handlePageChange"
      />
    </div>

    <el-dialog v-model="dialogVisible" :width="uploadDialogFullscreen ? '100%' : '580px'" :fullscreen="uploadDialogFullscreen" class="smart-dialog">
      <template #header>
        <DialogHeaderBar title="上传简历" :fullscreen="uploadDialogFullscreen" @toggle="toggleUploadDialogFullscreen" />
      </template>
      <el-alert
        title="上传简历后会自动识别姓名、电话、邮箱、学历、学校专业、最近公司和岗位，识别结果可手工修正。"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 16px"
      />
      <el-form :model="uploadForm" label-width="88px">
        <el-form-item label="姓名">
          <el-input v-model="uploadForm.name" />
        </el-form-item>
        <el-form-item label="性别">
          <el-select v-model="uploadForm.gender" placeholder="选择性别" style="width: 100%">
            <el-option label="男" value="男" />
            <el-option label="女" value="女" />
          </el-select>
        </el-form-item>
        <el-form-item label="年龄">
          <el-input-number v-model="uploadForm.age" :min="16" :max="80" style="width: 100%" />
        </el-form-item>
        <el-form-item label="学历">
          <el-input v-model="uploadForm.education" placeholder="例如：本科 / 硕士" />
        </el-form-item>
        <el-form-item label="工作年限">
          <el-input-number v-model="uploadForm.work_years" :min="0" :max="50" style="width: 100%" />
        </el-form-item>
        <el-form-item label="学校专业">
          <el-input v-model="uploadForm.school_major" placeholder="例如：浙江大学 / 软件工程" />
        </el-form-item>
        <el-form-item label="所在公司">
          <el-input v-model="uploadForm.current_company" placeholder="填写候选人当前或最近一家公司" />
        </el-form-item>
        <el-form-item label="所在岗位">
          <el-input v-model="uploadForm.current_position" placeholder="填写候选人当前或最近岗位" />
        </el-form-item>
        <el-form-item label="入职时间">
          <el-date-picker
            v-model="uploadForm.experience_start_date"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择入职时间"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="当前在职">
          <el-switch v-model="uploadForm.experience_is_current" />
        </el-form-item>
        <el-form-item v-if="!uploadForm.experience_is_current" label="离职时间">
          <el-date-picker
            v-model="uploadForm.experience_end_date"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择离职时间"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="工作描述">
          <el-input
            v-model="uploadForm.experience_description"
            type="textarea"
            :rows="3"
            placeholder="可选，填写主要职责或工作亮点"
          />
        </el-form-item>
        <el-form-item label="电话">
          <el-input v-model="uploadForm.phone" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="uploadForm.email" />
        </el-form-item>
        <el-form-item label="职位">
          <el-select v-model="uploadForm.job_id" placeholder="选择职位" style="width: 100%">
            <el-option v-for="job in jobs" :key="job.id" :label="job.title" :value="job.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="来源">
          <el-select v-model="uploadForm.source" placeholder="选择来源" style="width: 100%">
            <el-option label="手动录入" value="manual" />
            <el-option label="BOSS直聘" value="boss" />
            <el-option label="拉勾" value="lagou" />
            <el-option label="邮箱" value="email" />
          </el-select>
        </el-form-item>
        <el-form-item label="简历文件">
          <el-upload :auto-upload="false" :limit="1" :on-change="handleFileChange" :on-remove="handleFileRemove">
            <el-button :loading="parsingResume">选择文件</el-button>
          </el-upload>
          <div class="upload-hint">
            {{ parseHint }}
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="uploading" @click="submitUpload">上传</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editVisible" :width="editDialogFullscreen ? '100%' : '580px'" :fullscreen="editDialogFullscreen" class="smart-dialog">
      <template #header>
        <DialogHeaderBar title="编辑候选人" :fullscreen="editDialogFullscreen" @toggle="toggleEditDialogFullscreen" />
      </template>
      <el-form :model="editForm" label-width="88px">
        <el-form-item label="姓名"><el-input v-model="editForm.name" /></el-form-item>
        <el-form-item label="性别">
          <el-select v-model="editForm.gender" clearable style="width: 100%">
            <el-option label="男" value="男" />
            <el-option label="女" value="女" />
          </el-select>
        </el-form-item>
        <el-form-item label="年龄"><el-input-number v-model="editForm.age" :min="16" :max="80" style="width: 100%" /></el-form-item>
        <el-form-item label="学历"><el-input v-model="editForm.education" /></el-form-item>
        <el-form-item label="工作年限"><el-input-number v-model="editForm.work_years" :min="0" :max="50" style="width: 100%" /></el-form-item>
        <el-form-item label="学校专业"><el-input v-model="editForm.school_major" /></el-form-item>
        <el-form-item label="所在公司"><el-input v-model="editForm.current_company" /></el-form-item>
        <el-form-item label="所在岗位"><el-input v-model="editForm.current_position" /></el-form-item>
        <el-form-item label="入职时间">
          <el-date-picker v-model="editForm.experience_start_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="当前在职"><el-switch v-model="editForm.experience_is_current" /></el-form-item>
        <el-form-item v-if="!editForm.experience_is_current" label="离职时间">
          <el-date-picker v-model="editForm.experience_end_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="工作描述"><el-input v-model="editForm.experience_description" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="电话"><el-input v-model="editForm.phone" /></el-form-item>
        <el-form-item label="邮箱"><el-input v-model="editForm.email" /></el-form-item>
        <el-form-item label="岗位">
          <el-select v-model="editForm.job_id" clearable style="width: 100%">
            <el-option v-for="job in jobs" :key="job.id" :label="job.title" :value="job.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="来源">
          <el-select v-model="editForm.source" style="width: 100%">
            <el-option label="手动录入" value="manual" />
            <el-option label="BOSS直聘" value="boss" />
            <el-option label="拉勾" value="lagou" />
            <el-option label="邮箱" value="email" />
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingEdit" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="候选人详情" size="520px">
      <el-skeleton :loading="detailLoading" animated>
        <template #template>
          <el-skeleton-item variant="rect" style="width: 100%; height: 420px" />
        </template>

        <template v-if="detail.resume">
          <div v-if="hasImportInsights" class="detail-section">
            <h3>识别提示</h3>
            <el-alert :title="importInsightTitle" type="warning" :closable="false" show-icon />
            <div v-if="lowConfidenceFieldLabels.length" class="confidence-tags">
              <el-tag v-for="item in lowConfidenceFieldLabels" :key="item" type="warning" effect="light">{{ item }}</el-tag>
            </div>
          </div>

          <div class="detail-section">
            <h3>基本信息</h3>
            <div class="detail-grid">
              <div><strong>姓名：</strong>{{ detail.resume.name }} <template v-if="fieldHint('name')"><el-tag size="small" :type="fieldHint('name')?.tagType" effect="light">{{ fieldHint('name')?.label }}</el-tag><span class="field-source">{{ fieldHint('name')?.sourceText }}</span></template></div>
              <div><strong>性别：</strong>{{ detail.resume.gender || '-' }} <template v-if="fieldHint('gender')"><el-tag size="small" :type="fieldHint('gender')?.tagType" effect="light">{{ fieldHint('gender')?.label }}</el-tag><span class="field-source">{{ fieldHint('gender')?.sourceText }}</span></template></div>
              <div><strong>年龄：</strong>{{ detail.resume.age ?? '-' }} <template v-if="fieldHint('age')"><el-tag size="small" :type="fieldHint('age')?.tagType" effect="light">{{ fieldHint('age')?.label }}</el-tag><span class="field-source">{{ fieldHint('age')?.sourceText }}</span></template></div>
              <div><strong>学历：</strong>{{ detail.resume.education || '-' }} <template v-if="fieldHint('education')"><el-tag size="small" :type="fieldHint('education')?.tagType" effect="light">{{ fieldHint('education')?.label }}</el-tag><span class="field-source">{{ fieldHint('education')?.sourceText }}</span></template></div>
              <div><strong>工作年限：</strong>{{ detail.resume.work_years ? `${detail.resume.work_years}年` : '-' }} <template v-if="fieldHint('work_years')"><el-tag size="small" :type="fieldHint('work_years')?.tagType" effect="light">{{ fieldHint('work_years')?.label }}</el-tag><span class="field-source">{{ fieldHint('work_years')?.sourceText }}</span></template></div>
              <div><strong>学校及专业：</strong>{{ detail.resume.school_major || '-' }} <template v-if="fieldHint('school_major')"><el-tag size="small" :type="fieldHint('school_major')?.tagType" effect="light">{{ fieldHint('school_major')?.label }}</el-tag><span class="field-source">{{ fieldHint('school_major')?.sourceText }}</span></template></div>
              <div><strong>所在公司：</strong>{{ detail.resume.current_company || '-' }} <template v-if="fieldHint('current_company')"><el-tag size="small" :type="fieldHint('current_company')?.tagType" effect="light">{{ fieldHint('current_company')?.label }}</el-tag><span class="field-source">{{ fieldHint('current_company')?.sourceText }}</span></template></div>
              <div><strong>所在岗位：</strong>{{ detail.resume.current_position || '-' }} <template v-if="fieldHint('current_position')"><el-tag size="small" :type="fieldHint('current_position')?.tagType" effect="light">{{ fieldHint('current_position')?.label }}</el-tag><span class="field-source">{{ fieldHint('current_position')?.sourceText }}</span></template></div>
              <div><strong>电话：</strong>{{ detail.resume.phone || '-' }} <template v-if="fieldHint('phone')"><el-tag size="small" :type="fieldHint('phone')?.tagType" effect="light">{{ fieldHint('phone')?.label }}</el-tag><span class="field-source">{{ fieldHint('phone')?.sourceText }}</span></template></div>
              <div><strong>邮箱：</strong>{{ detail.resume.email || '-' }} <template v-if="fieldHint('email')"><el-tag size="small" :type="fieldHint('email')?.tagType" effect="light">{{ fieldHint('email')?.label }}</el-tag><span class="field-source">{{ fieldHint('email')?.sourceText }}</span></template></div>
              <div><strong>岗位：</strong>{{ detail.job?.title || detail.resume.Job?.title || '-' }}</div>
              <div><strong>状态：</strong>{{ toLabel(detail.resume.status, statusLabelMap) }}</div>
              <div><strong>来源：</strong>{{ toLabel(detail.resume.source, sourceLabelMap) }}</div>
              <div><strong>邮箱收到时间：</strong>{{ detail.resume.source === 'email' ? formatTime(detail.resume.source_received_at) : '-' }}</div>
              <div><strong>入库时间：</strong>{{ formatTime(detail.resume.received_at) }}</div>
              <div><strong>面试进度：</strong>{{ detail.current_round }}/{{ detail.total_rounds }}</div>
            </div>
          </div>

          <div class="detail-section">
            <h3>复筛信息</h3>
            <div class="detail-grid">
              <div><strong>初筛时间：</strong>{{ formatTime(detail.resume.screened_at) }}</div>
              <div><strong>复筛时间：</strong>{{ formatTime(detail.resume.reviewed_at) }}</div>
              <div><strong>复筛面试官：</strong>{{ detail.resume.reviewer || '-' }}</div>
              <div><strong>复筛备注：</strong>{{ detail.resume.review_reason || '-' }}</div>
            </div>
          </div>

          <div class="detail-section">
            <h3>工作经历</h3>
            <el-empty v-if="!detail.experiences?.length" description="暂无工作经历" />
            <el-timeline v-else>
              <el-timeline-item
                v-for="item in detail.experiences"
                :key="item.id"
                :timestamp="experiencePeriod(item)"
                placement="top"
              >
                <div class="timeline-title">{{ item.company_name }} / {{ item.position_name }}</div>
                <div>是否在职：{{ item.is_current ? '是' : '否' }}</div>
                <div>描述：{{ item.description || '-' }}</div>
              </el-timeline-item>
            </el-timeline>
          </div>

          <div class="detail-section">
            <h3>面试记录</h3>
            <el-empty v-if="!detail.history?.length" description="暂无面试记录" />
            <el-timeline v-else>
              <el-timeline-item
                v-for="item in detail.history"
                :key="item.id"
                :timestamp="formatTime(item.scheduled_time)"
                placement="top"
              >
                <div class="timeline-title">{{ item.round_name || `第${item.round_index}轮面试` }}</div>
                <div>面试官：{{ item.interviewer || '-' }}</div>
                <div>状态：{{ toLabel(item.status, statusLabelMap) }} / 结果：{{ toLabel(item.result, resultLabelMap) }}</div>
                <div>建议：{{ recommendationLabel(item.recommendation) }}</div>
                <div>评价：{{ item.evaluation || '-' }}</div>
                <div>原因：{{ item.reason || '-' }}</div>
              </el-timeline-item>
            </el-timeline>
          </div>

          <div class="detail-section">
            <h3>流程时间线</h3>
            <el-empty v-if="!detail.stage_logs?.length" description="暂无流程日志" />
            <el-timeline v-else>
              <el-timeline-item
                v-for="item in detail.stage_logs"
                :key="item.id"
                :timestamp="formatTime(item.created_at)"
                placement="top"
              >
                <div class="timeline-title">
                  {{ toLabel(item.stage, stageLabelMap) }} / {{ toLabel(item.action, stageActionLabelMap) }}
                </div>
                <div>操作人：{{ item.operator_name || '-' }}</div>
                <div>说明：{{ item.comment || '-' }}</div>
              </el-timeline-item>
            </el-timeline>
          </div>

          <div class="detail-section">
            <h3>录用信息</h3>
            <div class="detail-grid">
              <div><strong>录用状态：</strong>{{ toLabel(detail.offer?.status, statusLabelMap) }}</div>
              <div><strong>薪资：</strong>{{ detail.offer?.salary || '-' }}</div>
              <div><strong>职级：</strong>{{ detail.offer?.level || '-' }}</div>
              <div><strong>入职日期：</strong>{{ formatTime(detail.offer?.join_date) }}</div>
            </div>
          </div>
        </template>
      </el-skeleton>
    </el-drawer>
  </section>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox, type UploadFile } from 'element-plus';
import { computed, onMounted, reactive, ref } from 'vue';
import { apiBaseUrl } from '../api/base';
import http from '../api/http';
import { formatDateCell, formatDateTime } from '../utils/time';
import DialogHeaderBar from '../components/DialogHeaderBar.vue';
import { useDialogFullscreen } from '../composables/useDialogFullscreen';
import {
  recommendationLabelMap,
  resultLabelMap,
  sourceLabelMap,
  stageActionLabelMap,
  stageLabelMap,
  statusLabelMap,
  toLabel
} from '../utils/labels';

interface Job {
  id: string;
  title: string;
}

interface Resume {
  id: string;
  name: string;
  gender?: string | null;
  age?: number | null;
  education?: string | null;
  work_years?: number | null;
  school_major?: string | null;
  current_company?: string | null;
  current_position?: string | null;
  phone: string;
  email: string;
  job_id?: string | null;
  source: string;
  status: string;
  current_round: number;
  total_rounds: number;
  received_at: string;
  source_received_at?: string | null;
  screened_at?: string | null;
  reviewer?: string | null;
  review_reason?: string | null;
  reviewed_at?: string | null;
  file_url: string;
  Job?: Job;
}

interface InterviewHistory {
  id: string;
  round_index: number;
  round_name?: string;
  interviewer?: string;
  scheduled_time?: string | null;
  status: string;
  result?: string | null;
  recommendation?: string | null;
  evaluation?: string | null;
  reason?: string | null;
}

interface ResumeExperience {
  id: string;
  company_name: string;
  position_name: string;
  start_date?: string | null;
  end_date?: string | null;
  is_current: boolean;
  description?: string | null;
}

interface StageLog {
  id: string;
  stage: string;
  action: string;
  operator_name?: string | null;
  comment?: string | null;
  created_at: string;
}

interface OfferInfo {
  id: string;
  status: string;
  salary?: string | null;
  level?: string | null;
  join_date?: string | null;
}

interface ResumeListResponse {
  rows: Resume[];
  total: number;
  page: number;
  pageSize: number;
}

interface ProgressResponse {
  resume: Resume;
  job?: Job;
  current_round: number;
  total_rounds: number;
  history: InterviewHistory[];
  experiences: ResumeExperience[];
  stage_logs: StageLog[];
  offer?: OfferInfo | null;
  latest_import_record?: LatestImportRecord | null;
}

interface ImportInsightMeta {
  field_sources?: Record<string, string[]>;
  field_confidence?: Record<string, number>;
  overall_confidence?: number;
  low_confidence_fields?: string[];
}

interface LatestImportRecord {
  source_label?: string | null;
  imported_at?: string | null;
  parsed_snapshot?: { _meta?: ImportInsightMeta } & Record<string, unknown>;
  raw_payload?: {
    subject?: string;
    from?: string;
    from_name?: string;
    from_email?: string;
    file_name?: string;
    email_received_at?: string;
  } | null;
}

interface ParsedResumeFields {
  name?: string;
  gender?: string;
  age?: number | null;
  education?: string;
  work_years?: number | null;
  school_major?: string;
  current_company?: string;
  current_position?: string;
  phone?: string;
  email?: string;
  job_suggestion_id?: string;
  job_suggestion_title?: string;
}

const statusOptions = [
  'new',
  'review_pending',
  'schedule_pending',
  'interviewing',
  'offer_pending',
  'offer_sent',
  'offer_accepted',
  'offer_declined',
  'hired',
  'rejected'
];
const filters = reactive({
  keyword: '',
  status: 'all',
  job_id: '',
  source: ''
});
const page = ref(1);
const pageSize = 10;
const total = ref(0);
const resumes = ref<Resume[]>([]);
const jobs = ref<Job[]>([]);
const tableRef = ref();
const dialogVisible = ref(false);
const uploading = ref(false);
const parsingResume = ref(false);
const parseHint = ref('支持自动识别 PDF、DOCX、DOC、TXT 中的常见简历字段。');
const selectedFile = ref<File | null>(null);
const { fullscreen: uploadDialogFullscreen, toggleFullscreen: toggleUploadDialogFullscreen } = useDialogFullscreen();
const editVisible = ref(false);
const { fullscreen: editDialogFullscreen, toggleFullscreen: toggleEditDialogFullscreen } = useDialogFullscreen();
const savingEdit = ref(false);
const editingResumeId = ref('');
const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = reactive<Partial<ProgressResponse>>({});
const fieldLabelMap: Record<string, string> = {
  name: '姓名',
  gender: '性别',
  age: '年龄',
  education: '学历',
  work_years: '工作年限',
  school_major: '学校及专业',
  current_company: '所在公司',
  current_position: '所在岗位',
  phone: '电话',
  email: '邮箱'
};
const fieldSourceLabelMap: Record<string, string> = {
  attachment: '附件识别',
  email_body: '邮件正文',
  email_template: '邮件模板',
  email_fallback: '邮件发件人/主题',
  unknown: '系统推断'
};

const uploadForm = reactive({
  name: '',
  gender: '',
  age: null as number | null,
  education: '',
  work_years: null as number | null,
  school_major: '',
  current_company: '',
  current_position: '',
  experience_start_date: '',
  experience_end_date: '',
  experience_is_current: true,
  experience_description: '',
  phone: '',
  email: '',
  job_id: '',
  source: 'manual'
});

const resetUploadForm = () => {
  uploadForm.name = '';
  uploadForm.gender = '';
  uploadForm.age = null;
  uploadForm.education = '';
  uploadForm.work_years = null;
  uploadForm.school_major = '';
  uploadForm.current_company = '';
  uploadForm.current_position = '';
  uploadForm.experience_start_date = '';
  uploadForm.experience_end_date = '';
  uploadForm.experience_is_current = true;
  uploadForm.experience_description = '';
  uploadForm.phone = '';
  uploadForm.email = '';
  uploadForm.job_id = '';
  uploadForm.source = 'manual';
  selectedFile.value = null;
  parseHint.value = '支持自动识别 PDF、DOCX、DOC、TXT 中的常见简历字段。';
};

const fileUrl = (url: string) => `${apiBaseUrl}${url}`;
const formatTime = (value?: string | null) => formatDateTime(value);
const effectiveReceivedAt = (resume: Resume) => resume.source_received_at || resume.received_at;
const recommendationLabel = (value?: string | null) => (value ? recommendationLabelMap[value] || value : '-');
const experiencePeriod = (item: ResumeExperience) => {
  const start = item.start_date ? formatTime(item.start_date).split(' ')[0] : '未知';
  const end = item.is_current ? '至今' : item.end_date ? formatTime(item.end_date).split(' ')[0] : '未知';
  return `${start} - ${end}`;
};
const importMeta = computed(() => detail.latest_import_record?.parsed_snapshot?._meta);
const lowConfidenceFields = computed(() => importMeta.value?.low_confidence_fields || []);
const lowConfidenceFieldLabels = computed(() =>
  lowConfidenceFields.value.map((item) => fieldLabelMap[item] || item)
);
const hasImportInsights = computed(() => !!importMeta.value);
const importInsightTitle = computed(() => {
  if (!importMeta.value) {
    return '';
  }

  const count = lowConfidenceFields.value.length;
  const overallScore = Number(importMeta.value.overall_confidence || 0);
  const overall = overallScore >= 0.85 ? '高' : overallScore >= 0.75 ? '中' : '低';
  return count
    ? `本次自动识别可信度：${overall}，其中 ${count} 个字段建议人工确认。`
    : `本次自动识别可信度：${overall}，当前没有明显低置信度字段。`;
});
const fieldHint = (field: string) => {
  if (!importMeta.value) {
    return null;
  }

  const confidence = Number(importMeta.value.field_confidence?.[field] || 0);
  const sources = importMeta.value.field_sources?.[field] || [];

  if (!confidence && !sources.length) {
    return null;
  }

  const lowConfidence = lowConfidenceFields.value.includes(field) || confidence < 0.75;
  return {
    label: lowConfidence ? '待确认' : confidence < 0.85 ? '建议核对' : '识别通过',
    tagType: lowConfidence ? 'warning' : confidence < 0.85 ? 'info' : 'success',
    sourceText: sources.length
      ? `来源：${sources.map((source) => fieldSourceLabelMap[source] || source).join(' / ')}`
      : ''
  };
};

const fetchJobs = async () => {
  const { data } = await http.get<Job[]>('/api/jobs');
  jobs.value = data;
};

const fetchResumes = async () => {
  try {
    const { data } = await http.get<ResumeListResponse>('/api/resumes', {
      params: {
        page: page.value,
        pageSize,
        keyword: filters.keyword || undefined,
        status: filters.status,
        job_id: filters.job_id || undefined,
        source: filters.source || undefined
      }
    });

    resumes.value = data.rows;
    total.value = data.total;
  } catch (error) {
    ElMessage.error('获取简历列表失败');
  }
};

const handleSearch = async () => {
  page.value = 1;
  await fetchResumes();
};

const resetFilters = async () => {
  filters.keyword = '';
  filters.job_id = '';
  filters.source = '';
  filters.status = 'all';
  tableRef.value?.clearSort?.();
  tableRef.value?.clearFilter?.();
  page.value = 1;
  await fetchResumes();
};

const handlePageChange = async (nextPage: number) => {
  page.value = nextPage;
  await fetchResumes();
};

const openDetail = async (resume: Resume) => {
  detailVisible.value = true;
  detailLoading.value = true;
  Object.keys(detail).forEach((key) => delete detail[key as keyof ProgressResponse]);

  try {
    const { data } = await http.get<ProgressResponse>(`/api/resumes/${resume.id}/interview-progress`);
    Object.assign(detail, data);
  } catch (error) {
    ElMessage.error('获取候选人详情失败');
    detailVisible.value = false;
  } finally {
    detailLoading.value = false;
  }
};

const applyParsedFields = (parsed: ParsedResumeFields) => {
  uploadForm.name = parsed.name || uploadForm.name;
  uploadForm.gender = parsed.gender || uploadForm.gender;
  uploadForm.age = parsed.age ?? uploadForm.age;
  uploadForm.education = parsed.education || uploadForm.education;
  uploadForm.work_years = parsed.work_years ?? uploadForm.work_years;
  uploadForm.school_major = parsed.school_major || uploadForm.school_major;
  uploadForm.current_company = parsed.current_company || uploadForm.current_company;
  uploadForm.current_position = parsed.current_position || uploadForm.current_position;
  uploadForm.phone = parsed.phone || uploadForm.phone;
  uploadForm.email = parsed.email || uploadForm.email;
  if (!uploadForm.job_id && parsed.job_suggestion_id) {
    uploadForm.job_id = parsed.job_suggestion_id;
  }
};

const handleFileChange = async (uploadFile: UploadFile) => {
  selectedFile.value = uploadFile.raw || null;

  if (!selectedFile.value) {
    return;
  }

  parsingResume.value = true;
  parseHint.value = '正在自动识别简历内容...';

  try {
    const formData = new FormData();
    formData.append('file', selectedFile.value);
    const { data } = await http.post<ParsedResumeFields>('/api/resumes/parse', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    applyParsedFields(data);

    const recognizedCount = [
      data.name,
      data.phone,
      data.email,
      data.education,
      data.school_major,
      data.current_company,
      data.current_position
    ].filter(Boolean).length;

    parseHint.value = recognizedCount
      ? `已自动识别 ${recognizedCount} 个字段，可直接上传或继续修正。`
      : '未识别到明确字段，请补全信息后上传。';
  } catch (error) {
    parseHint.value = '自动识别失败，请手工补全关键信息后上传。';
    ElMessage.warning('自动识别简历失败，已切换为手工录入');
  } finally {
    parsingResume.value = false;
  }
};

const handleFileRemove = () => {
  selectedFile.value = null;
  parseHint.value = '支持自动识别 PDF、DOCX、DOC、TXT 中的常见简历字段。';
};

const buildUploadFormData = (forceCreate = false) => {
  const formData = new FormData();
  formData.append('file', selectedFile.value as File);
  formData.append('name', uploadForm.name);
  formData.append('gender', uploadForm.gender || '');
  formData.append('age', uploadForm.age ? String(uploadForm.age) : '');
  formData.append('education', uploadForm.education || '');
  formData.append('work_years', uploadForm.work_years ? String(uploadForm.work_years) : '');
  formData.append('school_major', uploadForm.school_major || '');
  formData.append('current_company', uploadForm.current_company || '');
  formData.append('current_position', uploadForm.current_position || '');
  formData.append('experience_start_date', uploadForm.experience_start_date || '');
  formData.append('experience_end_date', uploadForm.experience_end_date || '');
  formData.append('experience_is_current', uploadForm.experience_is_current ? 'true' : 'false');
  formData.append('experience_description', uploadForm.experience_description || '');
  formData.append('phone', uploadForm.phone);
  formData.append('email', uploadForm.email);
  formData.append('job_id', uploadForm.job_id);
  formData.append('source', uploadForm.source);

  if (forceCreate) {
    formData.append('force_create', 'true');
  }

  return formData;
};

const submitUpload = async () => {
  if (!selectedFile.value || !uploadForm.job_id) {
    ElMessage.warning('请至少选择岗位并上传简历文件');
    return;
  }

  uploading.value = true;

  try {
    await http.post('/api/resumes/upload', buildUploadFormData(), {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    ElMessage.success('简历上传成功');
    dialogVisible.value = false;
    resetUploadForm();
    page.value = 1;
    await fetchResumes();
  } catch (error) {
    const duplicateResponse = (error as {
      response?: { status?: number; data?: { existingResume?: Resume } };
    }).response;

    if (duplicateResponse?.status === 409 && duplicateResponse.data?.existingResume) {
      const existingResume = duplicateResponse.data.existingResume;

      try {
        await ElMessageBox.confirm(
          `检测到重复候选人：${existingResume.name}（${existingResume.phone} / ${existingResume.email}）。是否仍然继续创建新记录？`,
          '发现重复候选人',
          {
            confirmButtonText: '继续创建',
            cancelButtonText: '查看现有记录',
            type: 'warning'
          }
        );

        await http.post('/api/resumes/upload', buildUploadFormData(true), {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        ElMessage.success('已按重复候选人继续创建');
        dialogVisible.value = false;
        resetUploadForm();
        page.value = 1;
        await fetchResumes();
      } catch (dialogAction) {
        if (dialogAction === 'cancel') {
          dialogVisible.value = false;
          filters.status = 'all';
          page.value = 1;
          await fetchResumes();
        }
      }
    } else {
      ElMessage.error('简历上传失败');
    }
  } finally {
    uploading.value = false;
  }
};

const editForm = reactive({
  name: '',
  gender: '',
  age: null as number | null,
  education: '',
  work_years: null as number | null,
  school_major: '',
  current_company: '',
  current_position: '',
  experience_start_date: '',
  experience_end_date: '',
  experience_is_current: true,
  experience_description: '',
  phone: '',
  email: '',
  job_id: '',
  source: 'manual'
});

const openEdit = (resume: Resume) => {
  editingResumeId.value = resume.id;
  editForm.name = resume.name || '';
  editForm.gender = resume.gender || '';
  editForm.age = resume.age ?? null;
  editForm.education = resume.education || '';
  editForm.work_years = resume.work_years ?? null;
  editForm.school_major = resume.school_major || '';
  editForm.current_company = resume.current_company || '';
  editForm.current_position = resume.current_position || '';
  editForm.experience_start_date = '';
  editForm.experience_end_date = '';
  editForm.experience_is_current = true;
  editForm.experience_description = '';
  editForm.phone = resume.phone || '';
  editForm.email = resume.email || '';
  editForm.job_id = resume.job_id || resume.Job?.id || '';
  editForm.source = resume.source || 'manual';
  editVisible.value = true;
};

const saveEdit = async () => {
  if (!editingResumeId.value) {
    return;
  }

  savingEdit.value = true;

  try {
    await http.put(`/api/resumes/${editingResumeId.value}`, editForm);
    ElMessage.success('候选人信息已更新');
    editVisible.value = false;
    await fetchResumes();
  } catch (error) {
    ElMessage.error('更新候选人信息失败');
  } finally {
    savingEdit.value = false;
  }
};

const confirmDelete = async (resume: Resume) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除候选人“${resume.name}”的简历吗？该操作不可恢复。`,
      '删除确认',
      {
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );

    await http.delete(`/api/resumes/${resume.id}`);
    ElMessage.success('简历已删除');
    await fetchResumes();
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除简历失败');
    }
  }
};

onMounted(async () => {
  await Promise.all([fetchJobs(), fetchResumes()]);
});
</script>

<style scoped>
.page {
  padding: 28px;
}

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 18px;
}

.upload-hint {
  margin-top: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.detail-section + .detail-section {
  margin-top: 24px;
}

.detail-section h3 {
  margin: 0 0 12px;
  font-size: 16px;
}

.confidence-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
  color: var(--text-main);
}

.field-source {
  margin-left: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.timeline-title {
  font-weight: 700;
  margin-bottom: 6px;
}
</style>
