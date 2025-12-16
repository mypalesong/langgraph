---
sidebar_position: 1
---

# Checkpointing (체크포인팅)

체크포인팅은 **그래프 실행 상태를 저장하고 복원**하는 기능입니다. 대화 기록 유지, 실행 재개, 타임 트래블 등을 가능하게 합니다.

## 왜 체크포인팅이 필요한가?

- **대화 지속**: 이전 대화 맥락 유지
- **에러 복구**: 실패 지점에서 재시작
- **Human-in-the-Loop**: 사람의 승인 후 재개
- **디버깅**: 특정 시점 상태 확인

## 기본 사용법

### MemorySaver (인메모리)

개발 및 테스트용으로 적합:

```python
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import StateGraph, START, END

# 체크포인터 생성
memory = MemorySaver()

# 그래프 컴파일 시 체크포인터 연결
app = graph.compile(checkpointer=memory)

# thread_id로 대화 세션 구분
config = {"configurable": {"thread_id": "user-123"}}

# 실행
result1 = app.invoke({"messages": [HumanMessage("안녕")]}, config)
result2 = app.invoke({"messages": [HumanMessage("내 이름 기억해?")]}, config)
```

### SqliteSaver (파일 기반)

영구 저장이 필요한 경우:

```python
from langgraph.checkpoint.sqlite import SqliteSaver

# SQLite 파일로 저장
with SqliteSaver.from_conn_string("checkpoints.db") as memory:
    app = graph.compile(checkpointer=memory)

    config = {"configurable": {"thread_id": "session-1"}}
    result = app.invoke(initial_state, config)
```

### PostgresSaver (프로덕션)

프로덕션 환경:

```python
from langgraph.checkpoint.postgres import PostgresSaver

DB_URI = "postgresql://user:password@localhost:5432/langgraph"

with PostgresSaver.from_conn_string(DB_URI) as memory:
    app = graph.compile(checkpointer=memory)
    # ... 실행
```

## 상태 조회 및 관리

### 현재 상태 조회

```python
config = {"configurable": {"thread_id": "session-1"}}

# 최신 상태 조회
state = app.get_state(config)
print(state.values)  # 현재 State
print(state.next)    # 다음 실행될 노드
```

### 상태 히스토리 조회

```python
# 모든 체크포인트 조회
for state in app.get_state_history(config):
    print(f"Step: {state.metadata.get('step')}")
    print(f"Node: {state.metadata.get('source')}")
    print(f"State: {state.values}")
    print("---")
```

### 특정 시점으로 복원 (Time Travel)

```python
# 히스토리에서 원하는 시점 찾기
history = list(app.get_state_history(config))
target_checkpoint = history[2]  # 3번째 체크포인트

# 해당 시점의 config 사용
replay_config = target_checkpoint.config
result = app.invoke(None, replay_config)  # 해당 시점부터 재실행
```

## 상태 수정

### update_state()

실행 중간에 상태를 수정할 수 있습니다:

```python
config = {"configurable": {"thread_id": "session-1"}}

# 현재 상태 조회
state = app.get_state(config)
print(state.values)  # {'counter': 5}

# 상태 업데이트
app.update_state(
    config,
    {"counter": 10},  # 새로운 값
    as_node="modifier"  # 어떤 노드에서 수정된 것처럼 기록
)

# 업데이트된 상태 확인
new_state = app.get_state(config)
print(new_state.values)  # {'counter': 10}

# 업데이트된 상태에서 계속 실행
result = app.invoke(None, config)
```

## 완전한 예제: 멀티턴 챗봇

```python
from typing import TypedDict, Annotated
from operator import add
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from langchain_openai import ChatOpenAI

class ChatState(TypedDict):
    messages: Annotated[list[BaseMessage], add]

llm = ChatOpenAI(model="gpt-4")

def chat_node(state: ChatState) -> dict:
    response = llm.invoke(state["messages"])
    return {"messages": [response]}

# 그래프 구성
graph = StateGraph(ChatState)
graph.add_node("chat", chat_node)
graph.add_edge(START, "chat")
graph.add_edge("chat", END)

# 체크포인터와 함께 컴파일
memory = MemorySaver()
app = graph.compile(checkpointer=memory)

# 대화 세션
config = {"configurable": {"thread_id": "conversation-1"}}

# 첫 번째 대화
result1 = app.invoke(
    {"messages": [HumanMessage("안녕! 나는 철수야.")]},
    config
)
print(result1["messages"][-1].content)

# 두 번째 대화 (이전 맥락 유지)
result2 = app.invoke(
    {"messages": [HumanMessage("내 이름이 뭐라고 했지?")]},
    config
)
print(result2["messages"][-1].content)  # "철수"라고 답변

# 다른 사용자의 새 대화
other_config = {"configurable": {"thread_id": "conversation-2"}}
result3 = app.invoke(
    {"messages": [HumanMessage("내 이름이 뭐지?")]},
    other_config
)
print(result3["messages"][-1].content)  # 모른다고 답변
```

## 체크포인터 비교

| 체크포인터 | 용도 | 영속성 | 성능 |
|------------|------|--------|------|
| `MemorySaver` | 개발/테스트 | 메모리 (휘발) | 빠름 |
| `SqliteSaver` | 단일 서버 | 파일 | 보통 |
| `PostgresSaver` | 프로덕션 | DB | 확장 가능 |

## 체크포인팅 팁

1. **thread_id 관리**: 사용자별, 세션별로 고유하게 지정
2. **정리 정책**: 오래된 체크포인트 주기적 삭제
3. **에러 핸들링**: 체크포인터 연결 실패 대비
4. **테스트**: 개발은 MemorySaver, 프로덕션은 PostgresSaver
