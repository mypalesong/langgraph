---
sidebar_position: 3
---

# 멀티 에이전트 시스템

여러 전문 에이전트가 **협업하여 복잡한 작업을 수행**하는 시스템을 만들어봅니다. 각 에이전트는 특정 역할에 집중하고, 슈퍼바이저가 작업을 조율합니다.

## 아키텍처

```
┌──────────────────────────────────────────────────────────┐
│                    Supervisor                             │
│                   (작업 조율자)                            │
└──────────────────────────────────────────────────────────┘
                          │
           ┌──────────────┼──────────────┐
           ▼              ▼              ▼
    ┌───────────┐  ┌───────────┐  ┌───────────┐
    │ Researcher│  │  Writer   │  │ Reviewer  │
    │ (조사담당) │  │ (작성담당) │  │ (검토담당) │
    └───────────┘  └───────────┘  └───────────┘
```

## 완성 코드

```python
from typing import TypedDict, Annotated, Literal, Sequence
from operator import add
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langgraph.graph import StateGraph, START, END

# === State 정의 ===

class MultiAgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add]
    next_agent: str
    task: str
    research_result: str
    draft: str
    final_output: str

# === 에이전트 정의 ===

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.7)

# 슈퍼바이저 프롬프트
SUPERVISOR_PROMPT = """당신은 팀의 슈퍼바이저입니다.
팀원: researcher(조사), writer(작성), reviewer(검토)

현재 상태를 보고 다음에 누가 작업할지 결정하세요.
작업 흐름:
1. researcher: 주제 조사
2. writer: 초안 작성
3. reviewer: 검토 및 피드백
4. FINISH: 모든 작업 완료

JSON 형식으로 응답: {"next": "에이전트명 또는 FINISH"}"""

RESEARCHER_PROMPT = """당신은 리서처입니다.
주어진 주제에 대해 핵심 정보를 조사하고 요약하세요.
- 주요 포인트 3-5개
- 관련 사실과 데이터
- 참고할 만한 관점"""

WRITER_PROMPT = """당신은 작가입니다.
리서처의 조사 결과를 바탕으로 글을 작성하세요.
- 명확하고 읽기 쉽게
- 논리적 흐름 유지
- 독자 친화적 어조"""

REVIEWER_PROMPT = """당신은 에디터입니다.
작성된 글을 검토하고 개선점을 제안하세요.
- 문법 및 맞춤법
- 논리적 일관성
- 명확성과 간결성"""

# === 노드 함수 ===

def supervisor_node(state: MultiAgentState) -> dict:
    """슈퍼바이저: 다음 작업자 결정"""
    messages = [
        SystemMessage(content=SUPERVISOR_PROMPT),
        HumanMessage(content=f"""
현재 상태:
- 작업: {state['task']}
- 조사 결과: {'완료' if state['research_result'] else '미완료'}
- 초안: {'완료' if state['draft'] else '미완료'}
- 최종 결과: {'완료' if state['final_output'] else '미완료'}

다음 작업자를 결정하세요.""")
    ]

    response = llm.invoke(messages)
    content = response.content

    # JSON 파싱
    import json
    try:
        result = json.loads(content)
        next_agent = result.get("next", "FINISH")
    except:
        # JSON 파싱 실패시 텍스트에서 추출
        if "researcher" in content.lower():
            next_agent = "researcher"
        elif "writer" in content.lower():
            next_agent = "writer"
        elif "reviewer" in content.lower():
            next_agent = "reviewer"
        else:
            next_agent = "FINISH"

    return {"next_agent": next_agent, "messages": [response]}

def researcher_node(state: MultiAgentState) -> dict:
    """리서처: 주제 조사"""
    messages = [
        SystemMessage(content=RESEARCHER_PROMPT),
        HumanMessage(content=f"다음 주제를 조사하세요: {state['task']}")
    ]

    response = llm.invoke(messages)
    return {
        "research_result": response.content,
        "messages": [AIMessage(content=f"[Researcher] {response.content}")]
    }

def writer_node(state: MultiAgentState) -> dict:
    """작가: 초안 작성"""
    messages = [
        SystemMessage(content=WRITER_PROMPT),
        HumanMessage(content=f"""
주제: {state['task']}

조사 결과:
{state['research_result']}

위 내용을 바탕으로 글을 작성하세요.""")
    ]

    response = llm.invoke(messages)
    return {
        "draft": response.content,
        "messages": [AIMessage(content=f"[Writer] {response.content}")]
    }

def reviewer_node(state: MultiAgentState) -> dict:
    """리뷰어: 검토 및 최종화"""
    messages = [
        SystemMessage(content=REVIEWER_PROMPT),
        HumanMessage(content=f"""
원본 초안:
{state['draft']}

검토하고 최종 버전을 작성하세요.""")
    ]

    response = llm.invoke(messages)
    return {
        "final_output": response.content,
        "messages": [AIMessage(content=f"[Reviewer] {response.content}")]
    }

# === 라우터 ===

def route_supervisor(state: MultiAgentState) -> Literal["researcher", "writer", "reviewer", "end"]:
    """슈퍼바이저 결정에 따른 라우팅"""
    next_agent = state.get("next_agent", "")

    if next_agent == "researcher":
        return "researcher"
    elif next_agent == "writer":
        return "writer"
    elif next_agent == "reviewer":
        return "reviewer"
    else:
        return "end"

# === 그래프 구성 ===

graph = StateGraph(MultiAgentState)

# 노드 추가
graph.add_node("supervisor", supervisor_node)
graph.add_node("researcher", researcher_node)
graph.add_node("writer", writer_node)
graph.add_node("reviewer", reviewer_node)

# 엣지 추가
graph.add_edge(START, "supervisor")
graph.add_conditional_edges(
    "supervisor",
    route_supervisor,
    {
        "researcher": "researcher",
        "writer": "writer",
        "reviewer": "reviewer",
        "end": END
    }
)

# 각 에이전트 작업 후 슈퍼바이저로 복귀
graph.add_edge("researcher", "supervisor")
graph.add_edge("writer", "supervisor")
graph.add_edge("reviewer", "supervisor")

# 컴파일
app = graph.compile()

# === 실행 ===

def run_multi_agent(task: str):
    """멀티 에이전트 시스템 실행"""
    print(f"\n{'='*60}")
    print(f"작업: {task}")
    print('='*60)

    initial_state = {
        "messages": [],
        "next_agent": "",
        "task": task,
        "research_result": "",
        "draft": "",
        "final_output": ""
    }

    # 스트리밍으로 진행 상황 확인
    for event in app.stream(initial_state, stream_mode="updates"):
        for node, update in event.items():
            if node == "supervisor":
                print(f"\n[Supervisor] 다음 작업자: {update.get('next_agent', 'N/A')}")
            elif node == "researcher":
                print(f"\n[Researcher] 조사 완료")
                print(f"  {update.get('research_result', '')[:200]}...")
            elif node == "writer":
                print(f"\n[Writer] 초안 작성 완료")
                print(f"  {update.get('draft', '')[:200]}...")
            elif node == "reviewer":
                print(f"\n[Reviewer] 최종 검토 완료")

    # 최종 결과
    state = app.invoke(initial_state)
    print(f"\n{'='*60}")
    print("최종 결과:")
    print('='*60)
    print(state["final_output"])

    return state["final_output"]

# 테스트
if __name__ == "__main__":
    result = run_multi_agent("인공지능의 미래에 대한 짧은 글")
```

## 다른 패턴: 계층적 에이전트

```python
# 상위 에이전트가 하위 에이전트 그래프를 호출하는 패턴

def create_research_team() -> StateGraph:
    """리서치 팀 서브그래프"""
    graph = StateGraph(ResearchState)
    graph.add_node("web_searcher", web_search_node)
    graph.add_node("paper_reader", paper_read_node)
    graph.add_node("summarizer", summarize_node)
    # ... 구성
    return graph.compile()

def create_writing_team() -> StateGraph:
    """작성 팀 서브그래프"""
    graph = StateGraph(WritingState)
    graph.add_node("outliner", outline_node)
    graph.add_node("drafter", draft_node)
    graph.add_node("editor", edit_node)
    # ... 구성
    return graph.compile()

# 메인 그래프에서 서브그래프 사용
main_graph = StateGraph(MainState)
main_graph.add_node("research_team", create_research_team())
main_graph.add_node("writing_team", create_writing_team())
main_graph.add_node("coordinator", coordinator_node)
```

## 다른 패턴: 대화형 에이전트

```python
# 에이전트들이 직접 대화하며 협업

class ConversationState(TypedDict):
    messages: Annotated[list[BaseMessage], add]
    speaker: str
    round: int

def agent_a(state: ConversationState) -> dict:
    """에이전트 A의 발언"""
    # 이전 대화 내용을 보고 응답
    response = llm.invoke([
        SystemMessage(content="당신은 낙관적인 분석가입니다."),
        *state["messages"],
        HumanMessage(content="당신의 관점에서 의견을 말씀해주세요.")
    ])
    return {
        "messages": [AIMessage(content=f"[Agent A] {response.content}")],
        "speaker": "B"
    }

def agent_b(state: ConversationState) -> dict:
    """에이전트 B의 발언"""
    response = llm.invoke([
        SystemMessage(content="당신은 비판적인 분석가입니다."),
        *state["messages"],
        HumanMessage(content="당신의 관점에서 의견을 말씀해주세요.")
    ])
    return {
        "messages": [AIMessage(content=f"[Agent B] {response.content}")],
        "speaker": "A",
        "round": state["round"] + 1
    }

def should_continue_conversation(state: ConversationState) -> Literal["agent_a", "agent_b", "end"]:
    if state["round"] >= 3:  # 3라운드 대화
        return "end"
    return f"agent_{state['speaker'].lower()}"
```

## 팁과 모범 사례

1. **명확한 역할 분담**: 각 에이전트의 책임을 명확히 정의

2. **상태 공유**: 에이전트 간 필요한 정보만 공유

3. **종료 조건**: 무한 루프 방지를 위한 명확한 종료 조건

4. **에러 핸들링**: 개별 에이전트 실패시 복구 전략

5. **로깅**: 에이전트 간 상호작용 기록

## 다음 단계

- [Human-in-the-Loop](/docs/advanced/human-in-the-loop) - 에이전트 결정에 사람 개입
- [체크포인팅](/docs/advanced/checkpointing) - 멀티 에이전트 상태 저장
- [스트리밍](/docs/advanced/streaming) - 실시간 협업 모니터링
