import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  description: ReactNode;
  emoji: string;
};

const FeatureList: FeatureItem[] = [
  {
    title: '그래프 기반 워크플로우',
    emoji: '🔗',
    description: (
      <>
        노드와 엣지로 복잡한 AI 워크플로우를 직관적으로 설계하세요.
        조건부 분기, 루프, 병렬 처리를 쉽게 구현할 수 있습니다.
      </>
    ),
  },
  {
    title: '강력한 상태 관리',
    emoji: '📊',
    description: (
      <>
        TypedDict 기반의 명확한 상태 정의와 리듀서를 통한 유연한 상태 업데이트.
        체크포인팅으로 실행 상태를 저장하고 복원하세요.
      </>
    ),
  },
  {
    title: '프로덕션 준비 완료',
    emoji: '🚀',
    description: (
      <>
        스트리밍, Human-in-the-Loop, 에러 핸들링 등
        실제 서비스에 필요한 모든 기능을 지원합니다.
      </>
    ),
  },
];

function Feature({title, emoji, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <span style={{fontSize: '4rem'}}>{emoji}</span>
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
