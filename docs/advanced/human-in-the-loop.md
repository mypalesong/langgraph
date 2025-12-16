---
sidebar_position: 3
---

# Human-in-the-Loop (HITL)

Human-in-the-Loop은 **그래프 실행 중 사람의 개입**을 가능하게 합니다. 승인, 수정, 피드백 등 사람의 판단이 필요한 워크플로우에 필수적입니다.

## 주요 사용 사례

- **승인 워크플로우**: 중요 작업 전 사람의 승인 필요
- **Tool 호출 검토**: AI가 호출하려는 도구/인자 확인
- **결과 수정**: AI 출력을 사람이 수정
- **에스컬레이션**: 복잡한 상황에서 사람에게 전달

## interrupt_before / interrupt_after

특정 노드 실행 전/후에 중단점을 설정합니다:

```python
from langgraph.checkpoint.memory import MemorySaver

memory = MemorySaver()

# 특정 노드 실행 전에 중단
app = graph.compile(
    checkpointer=memory,
    interrupt_before=["dangerous_action"]  # 이 노드 실행 전 중단
)

# 특정 노드 실행 후에 중단
app = graph.compile(
    checkpointer=memory,
    interrupt_after=["generate_plan"]  # 이 노드 실행 후 중단
)

# 여러 노드에 중단점 설정
app = graph.compile(
    checkpointer=memory,
    interrupt_before=["action1", "action2"],
    interrupt_after=["review"]
)
```

## 기본 승인 워크플로우

```python
from typing import TypedDict, Literal
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

class ApprovalState(TypedDict):
    request: str
    approved: bool
    result: str

def process_request(state: ApprovalState) -> dict:
    return {"request": f"처리 요청: {state['request']}"}

def execute_action(state: ApprovalState) -> dict:
    if state["approved"]:
        return {"result": "작업이 성공적으로 완료되었습니다."}
    return {"result": "작업이 거부되었습니다."}

# 그래프 구성
graph = StateGraph(ApprovalState)
graph.add_node("process", process_request)
graph.add_node("execute", execute_action)

graph.add_edge(START, "process")
graph.add_edge("process", "execute")
graph.add_edge("execute", END)

# execute 노드 전에 중단 (승인 필요)
memory = MemorySaver()
app = graph.compile(
    checkpointer=memory,
    interrupt_before=["execute"]
)

# 실행
config = {"configurable": {"thread_id": "approval-1"}}

# 1단계: process까지 실행 후 중단
result = app.invoke(
    {"request": "데이터 삭제", "approved": False, "result": ""},
    config
)
print(f"현재 상태: {result}")

# 상태 확인
state = app.get_state(config)
print(f"다음 노드: {state.next}")  # ['execute']

# 2단계: 사람이 승인 결정
human_approved = True  # 사람의 입력

# 상태 업데이트 후 재개
app.update_state(config, {"approved": human_approved})
final_result = app.invoke(None, config)  # None으로 재개
print(f"최종 결과: {final_result}")
```

## Tool 호출 검토

AI의 도구 호출을 사람이 검토하고 수정:

```python
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
from langgraph.graph import MessagesState

@tool
def send_email(to: str, subject: str, body: str) -> str:
    """이메일을 발송합니다."""
    return f"이메일 발송 완료: {to}"

@tool
def delete_file(path: str) -> str:
    """파일을 삭제합니다."""
    return f"파일 삭제됨: {path}"

tools = [send_email, delete_file]
llm = ChatOpenAI(model="gpt-4").bind_tools(tools)

def call_llm(state: MessagesState):
    return {"messages": [llm.invoke(state["messages"])]}

def execute_tools(state: MessagesState):
    last_msg = state["messages"][-1]
    results = []
    for call in last_msg.tool_calls:
        # 실제 도구 실행
        if call["name"] == "send_email":
            result = send_email.invoke(call["args"])
        elif call["name"] == "delete_file":
            result = delete_file.invoke(call["args"])
        results.append(ToolMessage(content=result, tool_call_id=call["id"]))
    return {"messages": results}

# 그래프 구성
graph = StateGraph(MessagesState)
graph.add_node("llm", call_llm)
graph.add_node("tools", execute_tools)

graph.add_edge(START, "llm")
graph.add_conditional_edges(
    "llm",
    lambda s: "tools" if s["messages"][-1].tool_calls else "__end__",
    {"tools": "tools", "__end__": END}
)
graph.add_edge("tools", "llm")

# tools 실행 전 중단
memory = MemorySaver()
app = graph.compile(
    checkpointer=memory,
    interrupt_before=["tools"]
)

# 실행
config = {"configurable": {"thread_id": "tool-review-1"}}

result = app.invoke(
    {"messages": [HumanMessage("test@example.com으로 보고서 보내줘")]},
    config
)

# 중단됨 - Tool 호출 검토
state = app.get_state(config)
last_msg = state.values["messages"][-1]
print(f"검토할 Tool 호출: {last_msg.tool_calls}")

# 사람이 검토 후 승인하면 재개
final = app.invoke(None, config)
```

## 사람의 입력을 기다리는 노드

```python
from langgraph.types import interrupt

class InteractiveState(TypedDict):
    question: str
    user_input: str
    response: str

def ask_question(state: InteractiveState) -> dict:
    return {"question": "계속 진행할까요? (y/n)"}

def wait_for_input(state: InteractiveState) -> dict:
    # interrupt()로 실행 중단
    user_response = interrupt("사용자 입력을 기다리는 중...")
    return {"user_input": user_response}

def process_input(state: InteractiveState) -> dict:
    if state["user_input"].lower() == "y":
        return {"response": "진행합니다!"}
    return {"response": "중단합니다."}

# 그래프 구성
graph = StateGraph(InteractiveState)
graph.add_node("ask", ask_question)
graph.add_node("wait", wait_for_input)
graph.add_node("process", process_input)

graph.add_edge(START, "ask")
graph.add_edge("ask", "wait")
graph.add_edge("wait", "process")
graph.add_edge("process", END)

memory = MemorySaver()
app = graph.compile(checkpointer=memory)

# 실행
config = {"configurable": {"thread_id": "interactive-1"}}

# wait 노드에서 interrupt로 중단됨
result = app.invoke(
    {"question": "", "user_input": "", "response": ""},
    config
)

# 사용자 입력 제공
app.update_state(config, {"user_input": "y"}, as_node="wait")
final = app.invoke(None, config)
print(final["response"])  # "진행합니다!"
```

## 완전한 예제: 문서 승인 시스템

```python
from typing import TypedDict, Literal
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from datetime import datetime

class DocumentState(TypedDict):
    document_id: str
    content: str
    status: str  # draft, pending_review, approved, rejected
    reviewer_comment: str
    history: list

def create_document(state: DocumentState) -> dict:
    return {
        "status": "draft",
        "history": state["history"] + [
            f"[{datetime.now()}] 문서 생성됨"
        ]
    }

def submit_for_review(state: DocumentState) -> dict:
    return {
        "status": "pending_review",
        "history": state["history"] + [
            f"[{datetime.now()}] 검토 요청됨"
        ]
    }

def process_review(state: DocumentState) -> dict:
    """검토자의 결정을 처리"""
    if state["status"] == "approved":
        return {
            "history": state["history"] + [
                f"[{datetime.now()}] 승인됨: {state['reviewer_comment']}"
            ]
        }
    else:
        return {
            "history": state["history"] + [
                f"[{datetime.now()}] 반려됨: {state['reviewer_comment']}"
            ]
        }

def route_after_review(state: DocumentState) -> Literal["finalize", "revise"]:
    if state["status"] == "approved":
        return "finalize"
    return "revise"

def finalize_document(state: DocumentState) -> dict:
    return {
        "history": state["history"] + [
            f"[{datetime.now()}] 문서 확정됨"
        ]
    }

def revise_document(state: DocumentState) -> dict:
    return {
        "status": "draft",
        "history": state["history"] + [
            f"[{datetime.now()}] 수정 중"
        ]
    }

# 그래프 구성
graph = StateGraph(DocumentState)

graph.add_node("create", create_document)
graph.add_node("submit", submit_for_review)
graph.add_node("review", process_review)
graph.add_node("finalize", finalize_document)
graph.add_node("revise", revise_document)

graph.add_edge(START, "create")
graph.add_edge("create", "submit")
graph.add_edge("submit", "review")
graph.add_conditional_edges("review", route_after_review)
graph.add_edge("finalize", END)
graph.add_edge("revise", "submit")  # 수정 후 다시 검토 요청

# review 노드 전에 중단 (사람의 검토 필요)
memory = MemorySaver()
app = graph.compile(
    checkpointer=memory,
    interrupt_before=["review"]
)

# 사용 예시
config = {"configurable": {"thread_id": "doc-001"}}

# 1. 문서 생성 및 검토 요청
result = app.invoke({
    "document_id": "DOC-001",
    "content": "중요한 문서 내용...",
    "status": "",
    "reviewer_comment": "",
    "history": []
}, config)

print("검토 대기 중...")
print(f"현재 상태: {result['status']}")

# 2. 검토자가 승인/반려 결정
# (웹 UI 등에서 검토자 입력 받음)
reviewer_decision = "approved"  # 또는 "rejected"
comment = "문서 내용 확인함. 승인합니다."

# 3. 검토 결과 반영 후 재개
app.update_state(config, {
    "status": reviewer_decision,
    "reviewer_comment": comment
})

final = app.invoke(None, config)
print("\n문서 히스토리:")
for entry in final["history"]:
    print(f"  {entry}")
```

## HITL 설계 팁

1. **명확한 중단점**: 어디서 사람 개입이 필요한지 명확히 정의
2. **상태 저장**: 반드시 체크포인터 사용
3. **타임아웃**: 장기간 대기 상황 처리
4. **UI 연동**: 프론트엔드와 상태 동기화
5. **감사 로그**: 모든 사람 개입 기록
