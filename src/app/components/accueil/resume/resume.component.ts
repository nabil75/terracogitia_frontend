import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTreeModule } from '@angular/material/tree';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule } from '@ngx-translate/core';
import {
  ApiService,
  KnowledgeOverviewDisciplineDto,
  KnowledgeOverviewQuestionDto,
  KnowledgeOverviewThemeDto,
} from '../../../api/api.service';
import { ThemeService } from '../../../shared/services/theme.service';
import { TransverseRailComponent } from '../../../shared/transverse-rail/transverse-rail.component';

export type ResumeNodeType =
  | 'discipline'
  | 'theme'
  | 'subtheme'
  | 'question'
  | 'proposition'
  | 'evaluation';

export interface ResumeTreeNode {
  name: string;
  type: ResumeNodeType;
  depth: number;
  refId?: number;
  dateCreation?: string | null;
  inactive?: boolean;
  children?: ResumeTreeNode[];
}

@Component({
  selector: 'app-resume',
  standalone: true,
  imports: [
    CommonModule,
    MatTreeModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    TransverseRailComponent,
    TranslateModule,
  ],
  templateUrl: './resume.component.html',
  styleUrl: './resume.component.scss',
})
export class ResumeComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly themeService = inject(ThemeService);

  loading = true;
  loadError = false;
  treeData: ResumeTreeNode[] = [];

  readonly childrenAccessor = (node: ResumeTreeNode): ResumeTreeNode[] =>
    node.children ?? [];

  readonly hasChild = (_index: number, node: ResumeTreeNode): boolean =>
    !!node.children?.length;

  ngOnInit(): void {
    this.loadOverview();
  }

  retryLoad(): void {
    this.loadOverview();
  }

  iconForType(type: ResumeNodeType): string {
    switch (type) {
      case 'discipline':
        return 'layers';
      case 'theme':
        return 'category';
      case 'subtheme':
        return 'route';
      case 'question':
        return 'quiz';
      case 'proposition':
        return 'lightbulb';
      case 'evaluation':
        return 'rate_review';
      default:
        return 'circle';
    }
  }

  formatDateCreation(raw: string | null | undefined): string {
    if (!raw?.trim()) {
      return '';
    }
    const parsed = Date.parse(raw);
    if (Number.isNaN(parsed)) {
      return raw.trim();
    }
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(parsed));
  }

  private loadOverview(): void {
    this.loading = true;
    this.loadError = false;
    this.api.getKnowledgeOverview().subscribe({
      next: (data) => {
        this.treeData = this.buildTree(data);
        this.loading = false;
      },
      error: () => {
        this.treeData = [];
        this.loading = false;
        this.loadError = true;
      },
    });
  }

  private buildTree(
    disciplines: KnowledgeOverviewDisciplineDto[]
  ): ResumeTreeNode[] {
    return disciplines.map((discipline) => ({
      name: discipline.label,
      type: 'discipline' as const,
      depth: 0,
      children: discipline.themes.map((theme) => this.buildThemeNode(theme, 1)),
    }));
  }

  private buildThemeNode(theme: KnowledgeOverviewThemeDto, depth: number): ResumeTreeNode {
    if (!theme.subthemes.length) {
      return {
        name: theme.label,
        type: 'theme',
        depth,
        inactive: true,
      };
    }
    return {
      name: theme.label,
      type: 'theme',
      depth,
      children: theme.subthemes.map((subtheme) => ({
        name: subtheme.label,
        type: 'subtheme' as const,
        depth: depth + 1,
        children: subtheme.questions.length
          ? subtheme.questions.map((question) =>
              this.buildQuestionNode(question, depth + 2)
            )
          : undefined,
      })),
    };
  }

  private buildQuestionNode(
    question: KnowledgeOverviewQuestionDto,
    depth: number
  ): ResumeTreeNode {
    const leafDepth = depth + 1;
    const leaves: ResumeTreeNode[] = [
      ...question.propositions.map((prop) => ({
        name: `#${prop.id_proposition}`,
        type: 'proposition' as const,
        depth: leafDepth,
        refId: prop.id_proposition,
        dateCreation: prop.date_creation,
      })),
      ...question.evaluations.map((ev) => ({
        name: `#${ev.id_evaluation}`,
        type: 'evaluation' as const,
        depth: leafDepth,
        refId: ev.id_evaluation,
        dateCreation: ev.date_creation,
      })),
    ];
    return {
      name: question.label,
      type: 'question',
      depth,
      children: leaves.length > 0 ? leaves : undefined,
    };
  }
}
